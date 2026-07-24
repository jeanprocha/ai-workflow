/**
 * Catalogo de metadados dos nodes, seguro para bundling no browser.
 *
 * Ao contrario de "./registry.js" (server-only), este modulo nunca importa
 * drivers de banco/SMTP/parsers com dependencias nativas do Node (pg,
 * mysql2, mongodb, ioredis, nodemailer, pdf-parse, mammoth) — apenas tipo,
 * categoria, label, icone, outputs e defaultConfig. Usado pela paleta e pelo
 * painel de configuracao do editor (apps/web).
 */
import type { NodeCategory } from "@workflow/shared";
import { manualTriggerNode } from "./definitions/manual-trigger.js";
import { webhookTriggerNode } from "./definitions/webhook-trigger.js";
import { httpRequestNode } from "./definitions/http-request.js";
import { ifNode } from "./definitions/if.js";
import { switchNode } from "./definitions/switch.js";
import { setVariablesNode } from "./definitions/set-variables.js";
import { delayNode } from "./definitions/delay.js";
import { mergeNode } from "./definitions/merge.js";
import { parallelNode } from "./definitions/parallel.js";
import { logNode } from "./definitions/log.js";
import { graphqlRequestNode } from "./definitions/graphql-request.js";
import { csvParseNode } from "./definitions/csv-parse.js";
import { txtReadNode } from "./definitions/txt-read.js";
import { jsonParseNode } from "./definitions/json-parse.js";
import { slackMessageNode } from "./definitions/slack-message.js";
import { discordMessageNode } from "./definitions/discord-message.js";
import { telegramMessageNode } from "./definitions/telegram-message.js";
import { postgresQueryMeta } from "./definitions/postgres-query.meta.js";
import { mysqlQueryMeta } from "./definitions/mysql-query.meta.js";
import { redisCommandMeta } from "./definitions/redis-command.meta.js";
import { mongodbQueryMeta } from "./definitions/mongodb-query.meta.js";
import { emailSendMeta } from "./definitions/email-send.meta.js";
import { pdfParseMeta } from "./definitions/pdf-parse.meta.js";
import { docxParseMeta } from "./definitions/docx-parse.meta.js";
import { aiChatMeta } from "./definitions/ai-chat.meta.js";
import { aiClassificationMeta } from "./definitions/ai-classification.meta.js";
import { aiTranslationMeta } from "./definitions/ai-translation.meta.js";
import { aiSummarizationMeta } from "./definitions/ai-summarization.meta.js";
import { aiExtractionMeta } from "./definitions/ai-extraction.meta.js";
import { aiVisionMeta } from "./definitions/ai-vision.meta.js";
import { aiOcrMeta } from "./definitions/ai-ocr.meta.js";
import { aiEmbeddingsMeta } from "./definitions/ai-embeddings.meta.js";
import { agentNode } from "./definitions/agent.js";
import { knowledgeSearchNode } from "./definitions/knowledge-search.js";
import { mcpToolNode } from "./definitions/mcp-tool.js";

export interface NodeCatalogEntry {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  outputs: readonly string[];
  defaultConfig: Record<string, unknown>;
}

function toEntry(definition: {
  type: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  outputs: readonly string[];
  defaultConfig: unknown;
}): NodeCatalogEntry {
  return {
    type: definition.type,
    category: definition.category as NodeCategory,
    label: definition.label,
    description: definition.description,
    icon: definition.icon,
    outputs: definition.outputs,
    defaultConfig: definition.defaultConfig as Record<string, unknown>,
  };
}

export const NODE_CATALOG: readonly NodeCatalogEntry[] = [
  manualTriggerNode,
  webhookTriggerNode,
  httpRequestNode,
  ifNode,
  switchNode,
  setVariablesNode,
  delayNode,
  mergeNode,
  parallelNode,
  logNode,
  postgresQueryMeta,
  mysqlQueryMeta,
  redisCommandMeta,
  mongodbQueryMeta,
  graphqlRequestNode,
  csvParseNode,
  pdfParseMeta,
  docxParseMeta,
  txtReadNode,
  jsonParseNode,
  emailSendMeta,
  slackMessageNode,
  discordMessageNode,
  telegramMessageNode,
  aiChatMeta,
  aiClassificationMeta,
  aiTranslationMeta,
  aiSummarizationMeta,
  aiExtractionMeta,
  aiVisionMeta,
  aiOcrMeta,
  aiEmbeddingsMeta,
  agentNode,
  knowledgeSearchNode,
  mcpToolNode,
].map(toEntry);

export function getCatalogEntry(type: string): NodeCatalogEntry | undefined {
  return NODE_CATALOG.find((entry) => entry.type === type);
}
