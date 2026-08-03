import { test, expect } from "../../helpers/fixtures";
import { API_URL, buildTestUser, registerViaApi, buildStorageState, authenticateContext } from "../../helpers/auth";
import { fetchWorkspaceId, workspaceHeaders } from "../../helpers/settings";
import {
  createWorkflowViaApi,
  saveGraphViaApi,
  setWorkflowStatusViaApi,
  cronGraph,
} from "../../helpers/workflows";

/**
 * Fase 11 — Scheduler (cron de fluxo). Busca global (Ctrl+K) fica em search.spec.ts.
 *
 * Armadilhas mapeadas na discovery/execucao:
 * - POST sem @HttpCode no Nest retorna 201, nao 200 (mesmo gotcha da Fase 10
 *   pro /autocomplete/generate) — /scheduler/preview tambem e um POST puro.
 * - A mensagem de erro de expressao invalida ("Expressao cron invalida: ...")
 *   NAO e traduzida por x-lang — e um prefixo fixo em pt-BR concatenado com a
 *   mensagem (em ingles) da propria lib cron-parser.
 * - GET /health/queues e publico (sem auth) e agrega contagem GLOBAL por fila
 *   (nao por workflowId) — como a suite roda em paralelo (varios workers),
 *   comparacoes antes/depois usam desigualdade (>, <) e nao delta exato
 *   (+1/-1), pra nao quebrar por causa de outro teste que tambem registrou/
 *   removeu um cron ao mesmo tempo.
 * - Salvar o grafo NAO agenda mais nada enquanto o fluxo estiver em draft:
 *   quem liga o cron e o PATCH pra `active` (o gate vive em
 *   SchedulerService.syncWorkflowSchedule). Todo teste que ATIVA um fluxo com
 *   trigger.cron habilitado tem que deletar o workflow no finally, senao o
 *   repeatable job fica rodando pra sempre no Redis de dev.
 * - A ponta negativa do gate ("draft nao agenda") NAO da pra afirmar por
 *   /health/queues: a contagem e global por fila e a suite roda em paralelo,
 *   entao "nao aumentou" seria flaky. Ela e coberta deterministicamente nos
 *   unitarios (apps/api/src/scheduler/scheduler.service.spec.ts).
 * - O teste "disparo real" precisa do worker de execucoes rodando (pnpm
 *   --filter @workflow/api dev:worker) pra o job da fila "schedules" ser
 *   processado e criar a execucao.
 */

const UTC_DAILY_9AM = "0 9 * * *";

test.describe("CronFields (config panel)", () => {
  test("presets aplicam expressao e calculam proximas execucoes automaticamente", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Cron Presets");

    try {
      await saveGraphViaApi(request, tokens, workspaceId, workflow.id, cronGraph(UTC_DAILY_9AM));

      await authenticateContext(context, await buildStorageState(request, tokens));
      await page.goto(`/flows/${workflow.id}`);
      await page.locator('[data-testid="rf__node-n1"]').click();

      const panel = page.locator("aside").last();
      await expect(panel.getByText("Schedule", { exact: true })).toBeVisible();
      await expect(panel.getByLabel("Expressão cron")).toHaveValue(UTC_DAILY_9AM);

      await panel.getByLabel("Presets").selectOption({ label: "A cada hora" });
      await expect(panel.getByLabel("Expressão cron")).toHaveValue("0 * * * *");

      const nextRuns = panel.getByRole("list", { name: "Próximas execuções calculadas" });
      await expect(nextRuns).toBeVisible();
      await expect(nextRuns.locator("li")).toHaveCount(5);
    } finally {
      await request.delete(`${API_URL}/workflows/${workflow.id}`, { headers });
    }
  });

  test("expressao manual invalida mostra erro (role=alert, valida fix A4); corrigir some o erro e mostra as proximas execucoes", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Cron Invalido");

    try {
      await saveGraphViaApi(request, tokens, workspaceId, workflow.id, cronGraph(UTC_DAILY_9AM));

      await authenticateContext(context, await buildStorageState(request, tokens));
      await page.goto(`/flows/${workflow.id}`);
      await page.locator('[data-testid="rf__node-n1"]').click();
      const panel = page.locator("aside").last();

      const expression = panel.getByLabel("Expressão cron");
      await expression.fill("* * * * * * *");
      await page.keyboard.press("Tab");

      const alert = panel.getByRole("alert");
      await expect(alert).toBeVisible();
      await expect(alert).toContainText("Expressao cron invalida");

      await expression.fill(UTC_DAILY_9AM);
      await page.keyboard.press("Tab");

      await expect(alert).not.toBeVisible();
      await expect(panel.getByRole("list", { name: "Próximas execuções calculadas" })).toBeVisible();
    } finally {
      await request.delete(`${API_URL}/workflows/${workflow.id}`, { headers });
    }
  });

  test("timezone diferente muda o horario da proxima execucao calculada", async ({
    page,
    context,
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Cron TZ");

    try {
      // cronGraph() salva com timezone "UTC" — trocamos pra outra na UI.
      await saveGraphViaApi(request, tokens, workspaceId, workflow.id, cronGraph(UTC_DAILY_9AM));

      await authenticateContext(context, await buildStorageState(request, tokens));
      await page.goto(`/flows/${workflow.id}`);
      await page.locator('[data-testid="rf__node-n1"]').click();
      const panel = page.locator("aside").last();

      await panel.getByRole("button", { name: "Calcular próximas execuções" }).click();
      const firstRun = panel.getByRole("list", { name: "Próximas execuções calculadas" }).locator("li").first();
      await expect(firstRun).toBeVisible();
      const utcText = await firstRun.textContent();

      await panel.getByLabel("Timezone").selectOption("America/Los_Angeles");
      await expect(firstRun).toBeVisible();
      await expect
        .poll(async () => firstRun.textContent())
        .not.toBe(utcText);
    } finally {
      await request.delete(`${API_URL}/workflows/${workflow.id}`, { headers });
    }
  });
});

test.describe("Scheduler (API)", () => {
  test("preview: happy path UTC — 5 execucoes futuras, sequenciais, as 9h", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const response = await request.post(`${API_URL}/scheduler/preview`, {
      headers,
      data: { cronExpression: UTC_DAILY_9AM, timezone: "UTC" },
    });
    // Post sem @HttpCode no Nest -> default 201, nao 200.
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { nextRuns: string[] };
    expect(body.nextRuns).toHaveLength(5);

    for (const run of body.nextRuns) {
      expect(new Date(run).getUTCHours()).toBe(9);
      expect(new Date(run).getUTCMinutes()).toBe(0);
    }
    for (let i = 1; i < body.nextRuns.length; i++) {
      const diffMs = new Date(body.nextRuns[i]).getTime() - new Date(body.nextRuns[i - 1]).getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
    }
  });

  test("preview: timezone com offset (America/Sao_Paulo) desloca o horario UTC retornado", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const response = await request.post(`${API_URL}/scheduler/preview`, {
      headers,
      data: { cronExpression: UTC_DAILY_9AM, timezone: "America/Sao_Paulo" },
    });
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { nextRuns: string[] };
    // America/Sao_Paulo e UTC-3 o ano todo desde o fim do horario de verao (2019).
    expect(new Date(body.nextRuns[0]).getUTCHours()).toBe(12);
  });

  test("preview: expressao invalida retorna 400 com a mensagem do cron-parser", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const tooManyFields = await request.post(`${API_URL}/scheduler/preview`, {
      headers,
      data: { cronExpression: "* * * * * * *" },
    });
    expect(tooManyFields.status()).toBe(400);
    const tooManyFieldsBody = await tooManyFields.json();
    expect(tooManyFieldsBody.message).toContain("Expressao cron invalida");
    expect(tooManyFieldsBody.message).toContain("too many fields");

    const constraintError = await request.post(`${API_URL}/scheduler/preview`, {
      headers,
      data: { cronExpression: "60 * * * *" },
    });
    expect(constraintError.status()).toBe(400);
    const constraintErrorBody = await constraintError.json();
    expect(constraintErrorBody.message).toContain("Constraint error, got value 60 expected range 0-59");
  });

  test("preview: validacoes do DTO (cronExpression vazio, campo extra)", async ({ request }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);

    const empty = await request.post(`${API_URL}/scheduler/preview`, {
      headers,
      data: { cronExpression: "" },
    });
    expect(empty.status()).toBe(400);

    const extraField = await request.post(`${API_URL}/scheduler/preview`, {
      headers,
      data: { cronExpression: UTC_DAILY_9AM, foo: "bar" },
    });
    expect(extraField.status()).toBe(400);
  });

  test("guards: sem token 401; sem header de workspace 400; workspace de outro usuario 403", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());

    const noToken = await request.post(`${API_URL}/scheduler/preview`, {
      data: { cronExpression: UTC_DAILY_9AM },
    });
    expect(noToken.status()).toBe(401);

    const noWorkspace = await request.post(`${API_URL}/scheduler/preview`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      data: { cronExpression: UTC_DAILY_9AM },
    });
    expect(noWorkspace.status()).toBe(400);

    const otherTokens = await registerViaApi(request, buildTestUser());
    const otherWorkspaceId = await fetchWorkspaceId(request, otherTokens);
    const crossWorkspace = await request.post(`${API_URL}/scheduler/preview`, {
      headers: workspaceHeaders(tokens, otherWorkspaceId),
      data: { cronExpression: UTC_DAILY_9AM },
    });
    expect(crossWorkspace.status()).toBe(403);
  });

  test("ciclo de vida do repeatable job: ativar agenda, arquivar remove (GET /health/queues)", async ({
    request,
  }) => {
    const tokens = await registerViaApi(request, buildTestUser());
    const workspaceId = await fetchWorkspaceId(request, tokens);
    const headers = workspaceHeaders(tokens, workspaceId);
    const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Cron A2");

    try {
      const before = (
        await (await request.get(`${API_URL}/health/queues`)).json()
      ) as { schedules: { delayed: number } };

      // O fluxo nasce draft: salvar o grafo com cron habilitado nao agenda.
      await saveGraphViaApi(request, tokens, workspaceId, workflow.id, cronGraph("*/5 * * * *"));

      await setWorkflowStatusViaApi(request, tokens, workspaceId, workflow.id, "active");
      const afterActivate = (
        await (await request.get(`${API_URL}/health/queues`)).json()
      ) as { schedules: { delayed: number } };
      // Desigualdade, nao delta exato: /health/queues agrega contagem GLOBAL
      // da fila, e a suite roda varios specs em paralelo.
      expect(afterActivate.schedules.delayed).toBeGreaterThan(before.schedules.delayed);

      await setWorkflowStatusViaApi(request, tokens, workspaceId, workflow.id, "archived");
      const afterArchive = (
        await (await request.get(`${API_URL}/health/queues`)).json()
      ) as { schedules: { delayed: number } };
      expect(afterArchive.schedules.delayed).toBeLessThan(afterActivate.schedules.delayed);
    } finally {
      await request.delete(`${API_URL}/workflows/${workflow.id}`, { headers });
    }
  });
});

test("disparo real: cron de 1 em 1 minuto cria execucao com triggerType=cron", async ({ request }, testInfo) => {
  testInfo.setTimeout(150_000);

  const tokens = await registerViaApi(request, buildTestUser());
  const workspaceId = await fetchWorkspaceId(request, tokens);
  const headers = workspaceHeaders(tokens, workspaceId);
  const workflow = await createWorkflowViaApi(request, tokens, workspaceId, "Fluxo Cron Disparo Real");

  try {
    await saveGraphViaApi(request, tokens, workspaceId, workflow.id, cronGraph("* * * * *"));
    // Ativar e o que agenda de fato — salvar em draft nao dispara nada.
    await setWorkflowStatusViaApi(request, tokens, workspaceId, workflow.id, "active");

    const deadline = Date.now() + 120_000;
    let found = false;
    while (Date.now() < deadline && !found) {
      const response = await request.get(`${API_URL}/executions`, {
        headers,
        params: { workflowId: workflow.id },
      });
      const body = (await response.json()) as {
        items: Array<{ triggerType: string; status: string }>;
      };
      found = body.items.some((item) => item.triggerType === "cron" && item.status === "success");
      if (!found) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    expect(found).toBe(true);
  } finally {
    await request.delete(`${API_URL}/workflows/${workflow.id}`, { headers });
  }
});
