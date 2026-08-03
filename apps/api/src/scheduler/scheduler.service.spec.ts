import { Logger } from '@nestjs/common';
import type { WorkflowGraph } from '@workflow/shared';
import { SchedulerService } from './scheduler.service';

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

function buildService(repeatableJobs: Array<{ key: string }> = []) {
  const queue = {
    add: jest.fn().mockResolvedValue(undefined),
    getRepeatableJobs: jest.fn().mockResolvedValue(repeatableJobs),
    removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new SchedulerService(queue as never), queue };
}

function cronGraph(
  config: Record<string, unknown> = {
    cronExpression: '0 9 * * *',
    timezone: 'UTC',
    enabled: true,
  },
): WorkflowGraph {
  return {
    nodes: [
      {
        id: 'n1',
        type: 'trigger.cron',
        category: 'trigger',
        label: 'Schedule',
        position: { x: 0, y: 0 },
        config,
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as unknown as WorkflowGraph;
}

const MANUAL_GRAPH = {
  nodes: [
    {
      id: 'n1',
      type: 'trigger.manual',
      category: 'trigger',
      label: 'Manual Trigger',
      position: { x: 0, y: 0 },
      config: {},
    },
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
} as unknown as WorkflowGraph;

describe('SchedulerService.syncWorkflowSchedule', () => {
  it('fluxo active com cron habilitado: agenda o repeatable job com a chave = workflowId', async () => {
    const { service, queue } = buildService();

    await service.syncWorkflowSchedule('wf-1', 'ws-1', cronGraph(), 'active');

    expect(queue.add).toHaveBeenCalledWith(
      'run',
      { workflowId: 'wf-1', workspaceId: 'ws-1' },
      { repeat: { pattern: '0 9 * * *', tz: 'UTC', key: 'wf-1' } },
    );
  });

  it('fluxo draft: NAO agenda, mesmo com cron habilitado e expressao valida', async () => {
    const { service, queue } = buildService();

    await service.syncWorkflowSchedule('wf-1', 'ws-1', cronGraph(), 'draft');

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('fluxo archived: NAO agenda', async () => {
    const { service, queue } = buildService();

    await service.syncWorkflowSchedule('wf-1', 'ws-1', cronGraph(), 'archived');

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('draft com agendamento preexistente: remove o job antes de sair (o "desagendar" de quem volta pra rascunho)', async () => {
    const { service, queue } = buildService([{ key: 'wf-1' }]);

    await service.syncWorkflowSchedule('wf-1', 'ws-1', cronGraph(), 'draft');

    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('wf-1');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('nao mexe no agendamento de OUTRO workflow', async () => {
    const { service, queue } = buildService([{ key: 'wf-2' }]);

    await service.syncWorkflowSchedule('wf-1', 'ws-1', cronGraph(), 'draft');

    expect(queue.removeRepeatableByKey).not.toHaveBeenCalled();
  });

  it('active sem node de cron no grafo: nao agenda', async () => {
    const { service, queue } = buildService();

    await service.syncWorkflowSchedule('wf-1', 'ws-1', MANUAL_GRAPH, 'active');

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('active com cron desabilitado no node: nao agenda', async () => {
    const { service, queue } = buildService();

    await service.syncWorkflowSchedule(
      'wf-1',
      'ws-1',
      cronGraph({ cronExpression: '0 9 * * *', enabled: false }),
      'active',
    );

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('active com expressao invalida: loga e nao agenda (o save do grafo segue com sucesso)', async () => {
    const { service, queue } = buildService();

    await service.syncWorkflowSchedule(
      'wf-1',
      'ws-1',
      cronGraph({ cronExpression: '* * * * * * *', enabled: true }),
      'active',
    );

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('sem timezone no config: agenda em UTC', async () => {
    const { service, queue } = buildService();

    await service.syncWorkflowSchedule(
      'wf-1',
      'ws-1',
      cronGraph({ cronExpression: '0 9 * * *', enabled: true }),
      'active',
    );

    expect(queue.add).toHaveBeenCalledWith('run', expect.anything(), {
      repeat: expect.objectContaining({ tz: 'UTC' }),
    });
  });
});
