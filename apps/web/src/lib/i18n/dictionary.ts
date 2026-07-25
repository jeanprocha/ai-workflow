import * as common from "./dictionaries/common";
import * as nav from "./dictionaries/nav";
import * as shell from "./dictionaries/shell";
import * as auth from "./dictionaries/auth";
import * as settings from "./dictionaries/settings";
import * as flows from "./dictionaries/flows";
import * as executions from "./dictionaries/executions";
import * as editor from "./dictionaries/editor";
import * as agents from "./dictionaries/agents";
import * as knowledge from "./dictionaries/knowledge";
import * as mcp from "./dictionaries/mcp";
import * as dashboard from "./dictionaries/dashboard";
import * as analytics from "./dictionaries/analytics";
import * as costOptimizer from "./dictionaries/cost-optimizer";
import * as templates from "./dictionaries/templates";
import * as nodeCatalog from "./dictionaries/node-catalog";
import * as errors from "./dictionaries/errors";

/**
 * Cada dominio (pagina/area) mora no seu proprio arquivo em ./dictionaries,
 * exportando `pt` (fonte da verdade) e `en` (`satisfies typeof pt` — o
 * TypeScript acusa erro de compilacao se faltar uma chave). Esse arquivo so
 * agrega — pra adicionar um dominio novo, crie o arquivo e registre aqui uma
 * vez; editar o CONTEUDO de um dominio nunca precisa tocar aqui.
 */
export const pt = {
  common: common.pt,
  nav: nav.pt,
  shell: shell.pt,
  auth: auth.pt,
  settings: settings.pt,
  flows: flows.pt,
  executions: executions.pt,
  editor: editor.pt,
  agents: agents.pt,
  knowledge: knowledge.pt,
  mcp: mcp.pt,
  dashboard: dashboard.pt,
  analytics: analytics.pt,
  costOptimizer: costOptimizer.pt,
  templates: templates.pt,
  nodeCatalog: nodeCatalog.pt,
  errors: errors.pt,
};

export const en = {
  common: common.en,
  nav: nav.en,
  shell: shell.en,
  auth: auth.en,
  settings: settings.en,
  flows: flows.en,
  executions: executions.en,
  editor: editor.en,
  agents: agents.en,
  knowledge: knowledge.en,
  mcp: mcp.en,
  dashboard: dashboard.en,
  analytics: analytics.en,
  costOptimizer: costOptimizer.en,
  templates: templates.en,
  nodeCatalog: nodeCatalog.en,
  errors: errors.en,
} satisfies typeof pt;

export type Dictionary = typeof pt;
