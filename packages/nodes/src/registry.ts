import type { NodeDefinition } from "./types.js";
import { manualTriggerNode } from "./definitions/manual-trigger.js";
import { webhookTriggerNode } from "./definitions/webhook-trigger.js";
import { httpRequestNode } from "./definitions/http-request.js";
import { ifNode } from "./definitions/if.js";
import { setVariablesNode } from "./definitions/set-variables.js";
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

export const NODE_DEFINITIONS: readonly NodeDefinition<never>[] = [
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
