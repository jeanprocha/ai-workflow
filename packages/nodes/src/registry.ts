import type { NodeDefinition } from "./types.js";
import { manualTriggerNode } from "./definitions/manual-trigger.js";
import { webhookTriggerNode } from "./definitions/webhook-trigger.js";
import { cronTriggerNode } from "./definitions/cron-trigger.js";
import { chatTriggerNode } from "./definitions/chat-trigger.js";
import { chatReplyNode } from "./definitions/chat-reply.js";
import { httpRequestNode } from "./definitions/http-request.js";
import { ifNode } from "./definitions/if.js";
import { setVariablesNode } from "./definitions/set-variables.js";
import { transformListNode } from "./definitions/transform-list.js";
import { appendToListNode } from "./definitions/append-to-list.js";
import { logNode } from "./definitions/log.js";
import { switchNode } from "./definitions/switch.js";
import { delayNode } from "./definitions/delay.js";
import { mergeNode } from "./definitions/merge.js";
import { parallelNode } from "./definitions/parallel.js";
import { postgresQueryNode } from "./definitions/postgres-query.js";
import { mysqlQueryNode } from "./definitions/mysql-query.js";
import { redisCommandNode } from "./definitions/redis-command.js";
import { mongodbQueryNode } from "./definitions/mongodb-query.js";
import { graphqlRequestNode } from "./definitions/graphql-request.js";
import { csvParseNode } from "./definitions/csv-parse.js";
import { pdfParseNode } from "./definitions/pdf-parse.js";
import { docxParseNode } from "./definitions/docx-parse.js";
import { txtReadNode } from "./definitions/txt-read.js";
import { jsonParseNode } from "./definitions/json-parse.js";
import { emailSendNode } from "./definitions/email-send.js";
import { slackMessageNode } from "./definitions/slack-message.js";
import { discordMessageNode } from "./definitions/discord-message.js";
import { telegramMessageNode } from "./definitions/telegram-message.js";
import { aiChatNode } from "./definitions/ai-chat.js";
import { aiClassificationNode } from "./definitions/ai-classification.js";
import { aiTranslationNode } from "./definitions/ai-translation.js";
import { aiSummarizationNode } from "./definitions/ai-summarization.js";
import { aiExtractionNode } from "./definitions/ai-extraction.js";
import { aiVisionNode } from "./definitions/ai-vision.js";
import { aiOcrNode } from "./definitions/ai-ocr.js";
import { aiEmbeddingsNode } from "./definitions/ai-embeddings.js";
import { agentNode } from "./definitions/agent.js";
import { knowledgeSearchNode } from "./definitions/knowledge-search.js";
import { mcpToolNode } from "./definitions/mcp-tool.js";
import { githubCreateIssueNode } from "./definitions/github-create-issue.js";
import { stripeCreateCustomerNode } from "./definitions/stripe-create-customer.js";
import { notionCreatePageNode } from "./definitions/notion-create-page.js";
import { googleDriveListFilesNode } from "./definitions/google-drive-list-files.js";
import { linearCreateIssueNode } from "./definitions/linear-create-issue.js";
import { whatsappSendMessageNode } from "./definitions/whatsapp-send-message.js";
import { teamsMessageNode } from "./definitions/teams-message.js";

export const NODE_DEFINITIONS: readonly NodeDefinition<never>[] = [
  manualTriggerNode,
  webhookTriggerNode,
  cronTriggerNode,
  chatTriggerNode,
  chatReplyNode,
  httpRequestNode,
  ifNode,
  switchNode,
  setVariablesNode,
  transformListNode,
  appendToListNode,
  delayNode,
  mergeNode,
  parallelNode,
  logNode,
  postgresQueryNode,
  mysqlQueryNode,
  redisCommandNode,
  mongodbQueryNode,
  graphqlRequestNode,
  csvParseNode,
  pdfParseNode,
  docxParseNode,
  txtReadNode,
  jsonParseNode,
  emailSendNode,
  slackMessageNode,
  discordMessageNode,
  telegramMessageNode,
  aiChatNode,
  aiClassificationNode,
  aiTranslationNode,
  aiSummarizationNode,
  aiExtractionNode,
  aiVisionNode,
  aiOcrNode,
  aiEmbeddingsNode,
  agentNode,
  knowledgeSearchNode,
  mcpToolNode,
  githubCreateIssueNode,
  stripeCreateCustomerNode,
  notionCreatePageNode,
  googleDriveListFilesNode,
  linearCreateIssueNode,
  whatsappSendMessageNode,
  teamsMessageNode,
] as unknown as NodeDefinition<never>[];

const registry = new Map<string, NodeDefinition<never>>(
  NODE_DEFINITIONS.map((definition) => [definition.type, definition]),
);

export function getNodeDefinition(type: string): NodeDefinition<never> | undefined {
  return registry.get(type);
}

export function listNodeDefinitions(): readonly NodeDefinition<never>[] {
  return NODE_DEFINITIONS;
}
