import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createKnowledgeBaseViaApi,
  uploadDocumentViaApi,
  listDocumentsViaApi,
  waitForDocumentStatus,
  type DocumentSummary,
} from "../../helpers/knowledge";

/**
 * Fase 07 — Knowledge (API pura). Testes de UI ficam em knowledge.spec.ts.
 *
 * Precisa do worker rodando (fila "ingestion") pros testes de pipeline que
 * esperam o documento chegar a "failed". Nenhum teste aqui gasta token de
 * embedding de verdade: o unico caminho de sucesso ("ready") exige OpenAI
 * real e fica no teste @ai em knowledge.spec.ts.
 */

test.describe("Knowledge (API)", () => {
  test("POST /knowledge aplica os defaults do service; lista vem desc por createdAt", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const created = await request.post(`${API_URL}/knowledge`, {
      headers,
      data: { name: "Base Minima" },
    });
    expect(created.status()).toBe(201);
    // POST devolve a row crua (sem _count) — quem calcula _count.documents e
    // so a query da LISTA (include: { _count: {...} }).
    expect(await created.json()).toMatchObject({
      name: "Base Minima",
      description: null,
      provider: "openai",
      model: "text-embedding-3-small",
      credential: "",
      chunkSize: 1000,
      chunkOverlap: 150,
    });

    const second = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Recente",
    });

    const list = await request.get(`${API_URL}/knowledge`, { headers });
    expect(list.status()).toBe(200);
    const items = (await list.json()) as Array<{
      id: string;
      name: string;
      _count: { documents: number };
    }>;
    expect(items).toHaveLength(2);
    expect(items[0]!.id).toBe(second.id);
    expect(items[0]!._count).toEqual({ documents: 0 });
    expect(items[1]!.name).toBe("Base Minima");
  });

  test("validacao do POST: nome obrigatorio, provider fora do enum, chunkSize e campo extra", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const noName = await request.post(`${API_URL}/knowledge`, { headers, data: {} });
    expect(noName.status()).toBe(400);

    const badProvider = await request.post(`${API_URL}/knowledge`, {
      headers,
      data: { name: "X", provider: "ollama" },
    });
    expect(badProvider.status()).toBe(400);

    const chunkTooSmall = await request.post(`${API_URL}/knowledge`, {
      headers,
      data: { name: "X", chunkSize: 100 },
    });
    expect(chunkTooSmall.status()).toBe(400);

    const chunkTooBig = await request.post(`${API_URL}/knowledge`, {
      headers,
      data: { name: "X", chunkSize: 5000 },
    });
    expect(chunkTooBig.status()).toBe(400);

    // chunkSize nao tem @Type — string nao e coagida pra numero.
    const chunkAsString = await request.post(`${API_URL}/knowledge`, {
      headers,
      data: { name: "X", chunkSize: "1000" },
    });
    expect(chunkAsString.status()).toBe(400);

    const extraField = await request.post(`${API_URL}/knowledge`, {
      headers,
      data: { name: "X", foo: "bar" },
    });
    expect(extraField.status()).toBe(400);
  });

  test("upload valido: txt, md e csv sao aceitos com o sourceType certo", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Upload Valido",
    });

    const txt = await uploadDocumentViaApi(request, tokens, workspaceId, kb.id, {
      name: "notas.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Conteudo em texto puro."),
    });
    expect(txt.status()).toBe(201);
    expect(await txt.json()).toMatchObject({ sourceType: "txt", status: "processing", chunkCount: 0 });

    const md = await uploadDocumentViaApi(request, tokens, workspaceId, kb.id, {
      name: "manual.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Titulo\n\nConteudo em markdown."),
    });
    expect(md.status()).toBe(201);
    expect((await md.json()).sourceType).toBe("md");

    const csv = await uploadDocumentViaApi(request, tokens, workspaceId, kb.id, {
      name: "dados.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("nome,idade\nAlice,30\nBob,25\n"),
    });
    expect(csv.status()).toBe(201);
    expect((await csv.json()).sourceType).toBe("csv");
  });

  test("upload invalido: arquivo sem texto extraivel e pdf malformado dao 400", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Upload Invalido",
    });

    const empty = await uploadDocumentViaApi(request, tokens, workspaceId, kb.id, {
      name: "vazio.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("   \n\n   "),
    });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).message).toBe("O arquivo nao contem texto extraivel.");

    // CSV so com cabecalho (0 linhas de dados) tambem produz texto vazio.
    const emptyCsv = await uploadDocumentViaApi(request, tokens, workspaceId, kb.id, {
      name: "so-cabecalho.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("nome,idade\n"),
    });
    expect(emptyCsv.status()).toBe(400);
    expect((await emptyCsv.json()).message).toBe("O arquivo nao contem texto extraivel.");

    const emptyEn = await request.post(`${API_URL}/knowledge/${kb.id}/documents`, {
      headers: { ...headers, "x-lang": "en" },
      multipart: {
        file: { name: "vazio.txt", mimeType: "text/plain", buffer: Buffer.from("   ") },
      },
    });
    expect(emptyEn.status()).toBe(400);
    expect((await emptyEn.json()).message).toBe("The file has no extractable text.");

    const fakePdf = await uploadDocumentViaApi(request, tokens, workspaceId, kb.id, {
      name: "falso.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("isto nao e um pdf de verdade"),
    });
    expect(fakePdf.status()).toBe(400);
    expect((await fakePdf.json()).message).toMatch(/^Nao foi possivel extrair texto do arquivo: /);
  });

  test("upload sem a parte file: 400 em pt e en (nao 500 generico)", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Upload Sem File",
    });

    // multipart sem a chave "file" — @UploadedFile() fica undefined.
    const noFile = await request.post(`${API_URL}/knowledge/${kb.id}/documents`, {
      headers,
      multipart: { nota: "nenhum arquivo aqui" },
    });
    expect(noFile.status()).toBe(400);
    expect((await noFile.json()).message).toBe('Envie um arquivo no campo "file".');

    const noFileEn = await request.post(`${API_URL}/knowledge/${kb.id}/documents`, {
      headers: { ...headers, "x-lang": "en" },
      multipart: { nota: "nenhum arquivo aqui" },
    });
    expect(noFileEn.status()).toBe(400);
    expect((await noFileEn.json()).message).toBe('Send a file in the "file" field.');
  });

  test("pipeline do worker sem custo: credencial ausente/inexistente faz o documento falhar deterministicamente", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const kbNoCredential = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Sem Credencial API",
    });
    const uploadNoCredential = await uploadDocumentViaApi(
      request,
      tokens,
      workspaceId,
      kbNoCredential.id,
      { name: "doc.txt", mimeType: "text/plain", buffer: Buffer.from("Conteudo qualquer.") },
    );
    const documentNoCredential = (await uploadNoCredential.json()) as DocumentSummary;

    const failedNoCredential = await waitForDocumentStatus(
      request,
      tokens,
      workspaceId,
      kbNoCredential.id,
      documentNoCredential.id,
      "failed",
    );
    expect(failedNoCredential.error).toBe(
      "Configure a credencial do provider de embeddings na base de conhecimento.",
    );

    const kbGhostCredential = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Credencial Fantasma API",
      credential: "nao-existe",
    });
    const uploadGhostCredential = await uploadDocumentViaApi(
      request,
      tokens,
      workspaceId,
      kbGhostCredential.id,
      { name: "doc2.txt", mimeType: "text/plain", buffer: Buffer.from("Outro conteudo.") },
    );
    const documentGhostCredential = (await uploadGhostCredential.json()) as DocumentSummary;

    const failedGhostCredential = await waitForDocumentStatus(
      request,
      tokens,
      workspaceId,
      kbGhostCredential.id,
      documentGhostCredential.id,
      "failed",
    );
    expect(failedGhostCredential.error).toBe(
      'Credencial "nao-existe" nao encontrada neste workspace.',
    );

    // A lista de documentos nunca expoe rawText (so o GET individual de
    // upload expoe, e mesmo assim so na resposta do proprio POST).
    const documents = await listDocumentsViaApi(request, tokens, workspaceId, kbNoCredential.id);
    expect(documents[0]).not.toHaveProperty("rawText");
  });

  test("busca: credencial ausente/inexistente e validacoes do DTO", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const kb = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Busca API",
    });

    const noCredential = await request.post(`${API_URL}/knowledge/${kb.id}/search`, {
      headers,
      data: { query: "alguma pergunta" },
    });
    expect(noCredential.status()).toBe(400);
    expect((await noCredential.json()).message).toBe(
      "Configure a credencial do provider de embeddings na base de conhecimento.",
    );

    const noCredentialEn = await request.post(`${API_URL}/knowledge/${kb.id}/search`, {
      headers: { ...headers, "x-lang": "en" },
      data: { query: "alguma pergunta" },
    });
    expect(noCredentialEn.status()).toBe(400);
    expect((await noCredentialEn.json()).message).toBe(
      "Set the embeddings provider credential on the knowledge base.",
    );

    const kbGhost = await createKnowledgeBaseViaApi(request, tokens, workspaceId, {
      name: "Base Busca Credencial Fantasma",
      credential: "nao-cadastrada",
    });
    const ghostCredential = await request.post(`${API_URL}/knowledge/${kbGhost.id}/search`, {
      headers,
      data: { query: "alguma pergunta" },
    });
    expect(ghostCredential.status()).toBe(404);
    expect((await ghostCredential.json()).message).toBe(
      'Credencial "nao-cadastrada" nao encontrada neste workspace.',
    );

    const emptyQuery = await request.post(`${API_URL}/knowledge/${kb.id}/search`, {
      headers,
      data: { query: "" },
    });
    expect(emptyQuery.status()).toBe(400);

    const topKZero = await request.post(`${API_URL}/knowledge/${kb.id}/search`, {
      headers,
      data: { query: "x", topK: 0 },
    });
    expect(topKZero.status()).toBe(400);

    const topKTooBig = await request.post(`${API_URL}/knowledge/${kb.id}/search`, {
      headers,
      data: { query: "x", topK: 21 },
    });
    expect(topKTooBig.status()).toBe(400);

    const badThreshold = await request.post(`${API_URL}/knowledge/${kb.id}/search`, {
      headers,
      data: { query: "x", threshold: 1.5 },
    });
    expect(badThreshold.status()).toBe(400);
  });

  test("isolamento por workspace e cascade: KB de A da 404 pra B; deletar KB apaga os documentos", async ({
    request,
  }) => {
    const tokensA = await registerViaApi(request, buildTestUser());
    const workspaceA = await fetchWorkspaceId(request, tokensA);
    const headersA = workspaceHeaders(tokensA, workspaceA);
    const kbA = await createKnowledgeBaseViaApi(request, tokensA, workspaceA, {
      name: "Base Isolamento A",
    });
    const uploadA = await uploadDocumentViaApi(request, tokensA, workspaceA, kbA.id, {
      name: "doc-a.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Conteudo de A."),
    });
    const documentA = (await uploadA.json()) as DocumentSummary;

    const tokensB = await registerViaApi(request, buildTestUser());
    const workspaceB = await fetchWorkspaceId(request, tokensB);
    const headersB = workspaceHeaders(tokensB, workspaceB);

    const getDocuments = await request.get(`${API_URL}/knowledge/${kbA.id}/documents`, {
      headers: headersB,
    });
    expect(getDocuments.status()).toBe(404);

    const uploadForeign = await uploadDocumentViaApi(request, tokensB, workspaceB, kbA.id, {
      name: "intruso.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Tentativa de invasao."),
    });
    expect(uploadForeign.status()).toBe(404);

    const searchForeign = await request.post(`${API_URL}/knowledge/${kbA.id}/search`, {
      headers: headersB,
      data: { query: "x" },
    });
    expect(searchForeign.status()).toBe(404);

    const deleteForeign = await request.delete(`${API_URL}/knowledge/${kbA.id}`, {
      headers: headersB,
    });
    expect(deleteForeign.status()).toBe(404);

    const listB = await request.get(`${API_URL}/knowledge`, { headers: headersB });
    expect(listB.status()).toBe(200);
    expect(await listB.json()).toEqual([]);

    // documento de outra KB -> 404 "Documento nao encontrado.", nao a KB.
    const kbOther = await createKnowledgeBaseViaApi(request, tokensA, workspaceA, {
      name: "Base Isolamento A2",
    });
    const wrongKbDelete = await request.delete(
      `${API_URL}/knowledge/${kbOther.id}/documents/${documentA.id}`,
      { headers: headersA },
    );
    expect(wrongKbDelete.status()).toBe(404);
    expect((await wrongKbDelete.json()).message).toBe("Documento nao encontrado.");

    // DELETE da propria KB: 200, segundo DELETE 404, cascade nos documentos.
    const ownDelete = await request.delete(`${API_URL}/knowledge/${kbA.id}`, { headers: headersA });
    expect(ownDelete.status()).toBe(200);

    const secondDelete = await request.delete(`${API_URL}/knowledge/${kbA.id}`, {
      headers: headersA,
    });
    expect(secondDelete.status()).toBe(404);
    expect((await secondDelete.json()).message).toBe("Base de conhecimento nao encontrada.");

    const documentsAfterDelete = await request.get(`${API_URL}/knowledge/${kbA.id}/documents`, {
      headers: headersA,
    });
    expect(documentsAfterDelete.status()).toBe(404);
  });
});
