/**
 * Foco: o repasse de status para o scheduler. O gate ("so fluxo active
 * agenda") mora em SchedulerService e e testado la — aqui garantimos que cada
 * porta que sincroniza (save de grafo, rollback, PATCH de status) entrega o
 * status certo, que era exatamente o que faltava no saveGraph.
 *
 * Os dois mocks abaixo sao a mesma convencao de graph.schema.spec.ts: os
 * pacotes resolvem pro dist ESM puro, incompativel com o ts-jest do api em CJS.
 */
jest.mock('@workflow/nodes/catalog', () => ({
  getCatalogEntry: (type: string) => ({ type }),
}));
jest.mock('@workflow/shared', () => ({
  ERROR_HANDLE: 'error',
  APPROVAL_NODE_TYPE: 'approval.human',
}));

import { WorkflowsService } from './workflows.service';

const CRON_GRAPH = {
  nodes: [
    {
      id: 'n1',
      type: 'trigger.cron',
      category: 'trigger',
      label: 'Schedule',
      position: { x: 0, y: 0 },
      config: { cronExpression: '0 9 * * *', timezone: 'UTC', enabled: true },
    },
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

function buildService(workflow: Record<string, unknown>) {
  const tx = {
    workflowVersion: {
      create: jest.fn().mockResolvedValue({ id: 'ver-2', versionNumber: 2 }),
    },
    workflow: {
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...workflow, ...data }),
        ),
    },
  };
  const prisma = {
    workflow: {
      findFirst: jest.fn().mockResolvedValue(workflow),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...workflow, ...data }),
        ),
    },
    workflowVersion: {
      findFirst: jest.fn().mockResolvedValue({ id: 'ver-1', versionNumber: 1 }),
    },
    $transaction: jest
      .fn()
      .mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const scheduler = {
    syncWorkflowSchedule: jest.fn().mockResolvedValue(undefined),
    removeSchedule: jest.fn().mockResolvedValue(undefined),
  };
  const service = new WorkflowsService(prisma as never, scheduler as never);
  return { service, prisma, scheduler };
}

function baseWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wf-1',
    workspaceId: 'ws-1',
    status: 'draft',
    currentVersionId: 'ver-1',
    currentVersion: { id: 'ver-1', graph: CRON_GRAPH },
    ...overrides,
  };
}

describe('WorkflowsService — sincronizacao do agendamento', () => {
  it('saveGraph em fluxo draft: sincroniza passando "draft" (nao agenda)', async () => {
    const { service, scheduler } = buildService(baseWorkflow());

    await service.saveGraph('ws-1', 'wf-1', 'user-1', CRON_GRAPH);

    expect(scheduler.syncWorkflowSchedule).toHaveBeenCalledWith(
      'wf-1',
      'ws-1',
      expect.objectContaining({ nodes: expect.anything() }),
      'draft',
    );
  });

  it('saveGraph em fluxo active: sincroniza passando "active"', async () => {
    const { service, scheduler } = buildService(
      baseWorkflow({ status: 'active' }),
    );

    await service.saveGraph('ws-1', 'wf-1', 'user-1', CRON_GRAPH);

    expect(scheduler.syncWorkflowSchedule).toHaveBeenCalledWith(
      'wf-1',
      'ws-1',
      expect.anything(),
      'active',
    );
  });

  it('rollback: sincroniza com o status atual do fluxo', async () => {
    const { service, prisma, scheduler } = buildService(
      baseWorkflow({ status: 'archived' }),
    );
    prisma.workflowVersion.findFirst
      .mockResolvedValueOnce({ id: 'ver-1', graph: CRON_GRAPH })
      .mockResolvedValueOnce({ id: 'ver-1', versionNumber: 1 });

    await service.rollback('ws-1', 'wf-1', 'user-1', 'ver-1');

    expect(scheduler.syncWorkflowSchedule).toHaveBeenCalledWith(
      'wf-1',
      'ws-1',
      expect.anything(),
      'archived',
    );
  });

  it('PATCH ativando: sincroniza com o status NOVO, a partir do grafo da versao atual', async () => {
    const { service, scheduler } = buildService(baseWorkflow());

    await service.update('ws-1', 'wf-1', { status: 'active' });

    expect(scheduler.syncWorkflowSchedule).toHaveBeenCalledWith(
      'wf-1',
      'ws-1',
      CRON_GRAPH,
      'active',
    );
  });

  it('PATCH voltando pra rascunho: sincroniza com "draft" (o sync remove o job)', async () => {
    const { service, scheduler } = buildService(
      baseWorkflow({ status: 'active' }),
    );

    await service.update('ws-1', 'wf-1', { status: 'draft' });

    expect(scheduler.syncWorkflowSchedule).toHaveBeenCalledWith(
      'wf-1',
      'ws-1',
      CRON_GRAPH,
      'draft',
    );
  });

  it('PATCH de status em fluxo sem versao salva: remove direto (nao ha grafo pra sincronizar)', async () => {
    const { service, scheduler } = buildService(
      baseWorkflow({ currentVersionId: null, currentVersion: null }),
    );

    await service.update('ws-1', 'wf-1', { status: 'active' });

    expect(scheduler.syncWorkflowSchedule).not.toHaveBeenCalled();
    expect(scheduler.removeSchedule).toHaveBeenCalledWith('wf-1');
  });

  it('PATCH que nao toca em status (so renomeia): nao mexe no agendamento', async () => {
    const { service, scheduler } = buildService(
      baseWorkflow({ status: 'active' }),
    );

    await service.update('ws-1', 'wf-1', { name: 'Outro nome' });

    expect(scheduler.syncWorkflowSchedule).not.toHaveBeenCalled();
    expect(scheduler.removeSchedule).not.toHaveBeenCalled();
  });

  it('DELETE do fluxo remove o agendamento', async () => {
    const { service, prisma, scheduler } = buildService(baseWorkflow());
    (prisma.workflow as Record<string, unknown>).delete = jest
      .fn()
      .mockResolvedValue(undefined);

    await service.remove('ws-1', 'wf-1');

    expect(scheduler.removeSchedule).toHaveBeenCalledWith('wf-1');
  });
});
