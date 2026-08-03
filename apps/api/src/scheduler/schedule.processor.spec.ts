import { Logger } from '@nestjs/common';
import { ScheduleProcessor } from './schedule.processor';

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

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

type WorkflowRead = {
  status: string;
  currentVersion?: { graph: unknown } | null;
} | null;

/**
 * `reads` e a sequencia de respostas do findFirst: a primeira e o gate de
 * status, a segunda (quando existe) e a releitura pos-remocao. A ultima se
 * repete para as chamadas seguintes.
 */
function buildProcessor(...reads: WorkflowRead[]) {
  const executions = { trigger: jest.fn().mockResolvedValue(undefined) };
  const metrics = {};
  const findFirst = jest.fn();
  for (const read of reads) findFirst.mockResolvedValueOnce(read);
  findFirst.mockResolvedValue(reads[reads.length - 1] ?? null);
  const prisma = { workflow: { findFirst } };
  const scheduler = {
    removeSchedule: jest.fn().mockResolvedValue(undefined),
    syncWorkflowSchedule: jest.fn().mockResolvedValue(undefined),
  };
  const processor = new ScheduleProcessor(
    executions as never,
    metrics as never,
    prisma as never,
    scheduler as never,
  );
  return { processor, executions, prisma, scheduler };
}

/** ScheduleJobData nao e exportado — derivamos o tipo do proprio process(). */
const JOB = {
  id: 'job-1',
  data: { workflowId: 'wf-1', workspaceId: 'ws-1' },
} as unknown as Parameters<ScheduleProcessor['process']>[0];

describe('ScheduleProcessor', () => {
  it('fluxo active: dispara a execucao com triggerType "cron" e payload vazio', async () => {
    const { processor, executions, scheduler } = buildProcessor({
      status: 'active',
    });

    await processor.process(JOB);

    expect(executions.trigger).toHaveBeenCalledWith('ws-1', 'wf-1', 'cron', {});
    expect(scheduler.removeSchedule).not.toHaveBeenCalled();
  });

  it('agendamento orfao de fluxo draft: nao dispara e remove o job repetivel', async () => {
    const { processor, executions, scheduler } = buildProcessor({
      status: 'draft',
    });

    await processor.process(JOB);

    expect(executions.trigger).not.toHaveBeenCalled();
    expect(scheduler.removeSchedule).toHaveBeenCalledWith('wf-1');
  });

  it('agendamento orfao de fluxo archived: nao dispara e remove o job repetivel', async () => {
    const { processor, executions, scheduler } = buildProcessor({
      status: 'archived',
    });

    await processor.process(JOB);

    expect(executions.trigger).not.toHaveBeenCalled();
    expect(scheduler.removeSchedule).toHaveBeenCalledWith('wf-1');
  });

  it('workflow apagado (ou de outro workspace): nao dispara e remove o job repetivel', async () => {
    const { processor, executions, scheduler } = buildProcessor(null);

    await processor.process(JOB);

    expect(executions.trigger).not.toHaveBeenCalled();
    expect(scheduler.removeSchedule).toHaveBeenCalledWith('wf-1');
  });

  it('o gate resolve o workflow pelo par (id, workspaceId) do job', async () => {
    const { processor, prisma } = buildProcessor({ status: 'active' });

    await processor.process(JOB);

    expect(prisma.workflow.findFirst).toHaveBeenCalledWith({
      where: { id: 'wf-1', workspaceId: 'ws-1' },
      select: { status: true },
    });
  });

  it('draft na leitura do gate e draft na releitura: remove e NAO re-agenda', async () => {
    const { processor, scheduler } = buildProcessor({ status: 'draft' });

    await processor.process(JOB);

    expect(scheduler.removeSchedule).toHaveBeenCalledWith('wf-1');
    expect(scheduler.syncWorkflowSchedule).not.toHaveBeenCalled();
  });

  it('corrida com o PATCH de ativacao: se a releitura mostra active, re-sincroniza o agendamento que a remocao apagou', async () => {
    const { processor, executions, scheduler } = buildProcessor(
      { status: 'draft' },
      { status: 'active', currentVersion: { graph: CRON_GRAPH } },
    );

    await processor.process(JOB);

    // Este tick nao dispara — o status que ele leu era draft.
    expect(executions.trigger).not.toHaveBeenCalled();
    expect(scheduler.removeSchedule).toHaveBeenCalledWith('wf-1');
    expect(scheduler.syncWorkflowSchedule).toHaveBeenCalledWith(
      'wf-1',
      'ws-1',
      CRON_GRAPH,
      'active',
    );
  });

  it('a releitura acontece DEPOIS da remocao (ordem importa: reler antes nao fecharia a janela)', async () => {
    const { processor, prisma, scheduler } = buildProcessor(
      { status: 'draft' },
      { status: 'active', currentVersion: { graph: CRON_GRAPH } },
    );

    await processor.process(JOB);

    expect(prisma.workflow.findFirst).toHaveBeenCalledTimes(2);
    const removeOrder = scheduler.removeSchedule.mock.invocationCallOrder[0];
    const rereadOrder = prisma.workflow.findFirst.mock.invocationCallOrder[1];
    const syncOrder =
      scheduler.syncWorkflowSchedule.mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(rereadOrder);
    expect(rereadOrder).toBeLessThan(syncOrder);
  });

  it('reativado mas sem versao salva: nao tenta re-agendar (nao ha grafo do qual derivar o cron)', async () => {
    const { processor, scheduler } = buildProcessor(
      { status: 'draft' },
      { status: 'active', currentVersion: null },
    );

    await processor.process(JOB);

    expect(scheduler.removeSchedule).toHaveBeenCalledWith('wf-1');
    expect(scheduler.syncWorkflowSchedule).not.toHaveBeenCalled();
  });

  it('workflow apagado durante a remocao: releitura nula nao re-agenda', async () => {
    const { processor, scheduler } = buildProcessor({ status: 'draft' }, null);

    await processor.process(JOB);

    expect(scheduler.syncWorkflowSchedule).not.toHaveBeenCalled();
  });

  it('banco fora do ar: propaga o erro (job retentado) e NAO remove o agendamento', async () => {
    const { processor, scheduler, prisma } = buildProcessor({
      status: 'active',
    });
    prisma.workflow.findFirst.mockReset();
    prisma.workflow.findFirst.mockRejectedValue(new Error('DB fora do ar'));

    await expect(processor.process(JOB)).rejects.toThrow('DB fora do ar');
    expect(scheduler.removeSchedule).not.toHaveBeenCalled();
  });
});
