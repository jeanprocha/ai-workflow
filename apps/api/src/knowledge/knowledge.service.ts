import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { getProvider } from '@workflow/ai';
import { extractText, inferSourceType } from '@workflow/nodes';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { INGESTION_QUEUE } from '../queue/queue.module';
import { withJobContext } from '../observability/request-context';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { SearchKnowledgeDto } from './dto/search-knowledge.dto';
import { chunkText } from './chunking';
import { toVectorLiteral } from './vector-utils';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  metadata: unknown;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue,
  ) {}

  listKnowledgeBases(workspaceId: string) {
    return this.prisma.knowledgeBase.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { documents: true } } },
    });
  }

  createKnowledgeBase(workspaceId: string, dto: CreateKnowledgeBaseDto) {
    return this.prisma.knowledgeBase.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        provider: dto.provider ?? 'openai',
        model: dto.model ?? 'text-embedding-3-small',
        credential: dto.credential ?? '',
        chunkSize: dto.chunkSize ?? 1000,
        chunkOverlap: dto.chunkOverlap ?? 150,
      },
    });
  }

  async findKnowledgeBase(workspaceId: string, id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findFirst({
      where: { id, workspaceId },
    });
    if (!knowledgeBase) {
      throw new NotFoundException('Base de conhecimento nao encontrada.');
    }
    return knowledgeBase;
  }

  async removeKnowledgeBase(workspaceId: string, id: string) {
    await this.findKnowledgeBase(workspaceId, id);
    await this.prisma.knowledgeBase.delete({ where: { id } });
  }

  async listDocuments(workspaceId: string, knowledgeBaseId: string) {
    await this.findKnowledgeBase(workspaceId, knowledgeBaseId);
    return this.prisma.document.findMany({
      where: { knowledgeBaseId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        sourceType: true,
        status: true,
        error: true,
        chunkCount: true,
        createdAt: true,
      },
    });
  }

  async removeDocument(
    workspaceId: string,
    knowledgeBaseId: string,
    documentId: string,
  ) {
    await this.findKnowledgeBase(workspaceId, knowledgeBaseId);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, knowledgeBaseId },
    });
    if (!document) {
      throw new NotFoundException('Documento nao encontrado.');
    }
    await this.prisma.document.delete({ where: { id: documentId } });
  }

  async uploadDocument(
    workspaceId: string,
    knowledgeBaseId: string,
    file:
      { originalname: string; mimetype: string; buffer: Buffer } | undefined,
  ) {
    await this.findKnowledgeBase(workspaceId, knowledgeBaseId);

    // @UploadedFile() e undefined quando o multipart nao tem a parte "file"
    // (campo ausente ou nome errado) — sem esta guarda, inferSourceType
    // estourava um TypeError fora de qualquer try/catch, que o filtro global
    // de excecoes trata como 500 generico em vez de um 400 de validacao.
    if (!file) {
      throw new BadRequestException('Envie um arquivo no campo "file".');
    }

    const sourceType = inferSourceType(file.originalname, file.mimetype);
    let text: string;
    try {
      text = await extractText(file.buffer, sourceType);
    } catch (error) {
      throw new BadRequestException(
        `Nao foi possivel extrair texto do arquivo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!text.trim()) {
      throw new BadRequestException('O arquivo nao contem texto extraivel.');
    }

    const document = await this.prisma.document.create({
      data: {
        knowledgeBaseId,
        name: file.originalname,
        sourceType,
        status: 'processing',
        rawText: text,
      },
    });

    await this.queue.add('ingest', withJobContext({ documentId: document.id }));
    return document;
  }

  /** Chamado pelo IngestionProcessor (fila BullMQ) — chunk + embed + grava no pgvector. */
  async ingest(documentId: string): Promise<void> {
    const document = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { knowledgeBase: true },
    });

    try {
      const kb = document.knowledgeBase;
      const chunks = chunkText(
        document.rawText ?? '',
        kb.chunkSize,
        kb.chunkOverlap,
      );
      if (chunks.length === 0) {
        throw new Error('Nenhum chunk gerado a partir do texto extraido.');
      }

      const apiKey = await this.credentials.resolve(
        kb.workspaceId,
        kb.credential,
        {
          emptyNameMessage:
            'Configure a credencial do provider de embeddings na base de conhecimento.',
        },
      );
      const provider = getProvider(kb.provider);
      const result = await provider.embed({
        apiKey,
        model: kb.model,
        input: chunks,
      });

      for (let i = 0; i < chunks.length; i++) {
        const embedding = result.embeddings[i];
        if (!embedding) continue;
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO chunks (id, document_id, content, embedding, created_at)
           VALUES ($1, $2, $3, $4::vector, now())`,
          randomUUID(),
          documentId,
          chunks[i],
          toVectorLiteral(embedding),
        );
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'ready', chunkCount: chunks.length, error: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Falha ao processar documento ${documentId}: ${message}`,
      );
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed', error: message },
      });
    }
  }

  async search(
    workspaceId: string,
    knowledgeBaseId: string,
    dto: SearchKnowledgeDto,
  ): Promise<SearchResult[]> {
    const kb = await this.findKnowledgeBase(workspaceId, knowledgeBaseId);
    return this.searchInternal(kb, dto);
  }

  /** Usado pela tool de agentes e pelo node Knowledge Search — ja recebe a KB validada. */
  async searchInternal(
    kb: {
      id: string;
      workspaceId: string;
      provider: string;
      model: string;
      credential: string;
    },
    dto: SearchKnowledgeDto,
  ): Promise<SearchResult[]> {
    const apiKey = await this.credentials.resolve(
      kb.workspaceId,
      kb.credential,
      {
        emptyNameMessage:
          'Configure a credencial do provider de embeddings na base de conhecimento.',
      },
    );
    const provider = getProvider(kb.provider);
    const result = await provider.embed({
      apiKey,
      model: kb.model,
      input: dto.query,
    });
    const queryEmbedding = result.embeddings[0];
    if (!queryEmbedding) {
      throw new BadRequestException('Falha ao gerar embedding da busca.');
    }

    const topK = dto.topK ?? 5;
    const threshold = dto.threshold ?? 0;
    const vectorLiteral = toVectorLiteral(queryEmbedding);

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        document_id: string;
        content: string;
        metadata: unknown;
        document_name: string;
        similarity: number;
      }>
    >(
      `SELECT c.id, c.document_id, c.content, c.metadata, d.name AS document_name,
              1 - (c.embedding <=> $1::vector) AS similarity
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE d.knowledge_base_id = $2 AND d.status = 'ready'
       ORDER BY c.embedding <=> $1::vector
       LIMIT $3`,
      vectorLiteral,
      kb.id,
      topK,
    );

    return rows
      .filter((row) => row.similarity >= threshold)
      .map((row) => ({
        chunkId: row.id,
        documentId: row.document_id,
        documentName: row.document_name,
        content: row.content,
        similarity: row.similarity,
        metadata: row.metadata,
      }));
  }

  async getKnowledgeBaseForAgent(workspaceId: string, id: string) {
    return this.findKnowledgeBase(workspaceId, id);
  }
}
