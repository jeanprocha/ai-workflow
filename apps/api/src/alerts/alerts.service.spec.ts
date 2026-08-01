import { AlertsService, type FailureAlertParams } from './alerts.service';

function buildService(
  overrides: {
    cacheGet?: jest.Mock;
    workspaceAlertSetting?: unknown;
    members?: Array<{ user: { email: string } }>;
  } = {},
) {
  const prisma = {
    workspaceAlertSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.workspaceAlertSetting ?? null),
    },
    workspaceMember: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          overrides.members ?? [{ user: { email: 'a@example.com' } }],
        ),
    },
  };
  const cache = {
    get: overrides.cacheGet ?? jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const mailer = { send: jest.fn().mockResolvedValue(undefined) };

  const service = new AlertsService(
    prisma as never,
    cache as never,
    mailer as never,
  );
  return { service, prisma, cache, mailer };
}

const PARAMS: FailureAlertParams = {
  workspaceId: 'ws-1',
  workflowId: 'wf-1',
  workflowName: 'Fluxo Teste',
  executionId: 'exec-1',
  error: 'deu ruim',
};

describe('AlertsService', () => {
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('anti-spam (throttle)', () => {
    it('primeiro alerta do workflow: passa e marca o throttle no cache', async () => {
      const { service, cache, mailer } = buildService();

      await service.notifyExecutionFailed(PARAMS);

      expect(cache.get).toHaveBeenCalledWith('alert-throttle:wf-1');
      expect(cache.set).toHaveBeenCalledWith('alert-throttle:wf-1', '1', 600);
      expect(mailer.send).toHaveBeenCalledTimes(1);
    });

    it('workflow ja alertado recentemente: nao dispara nenhum canal', async () => {
      const { service, prisma, mailer } = buildService({
        cacheGet: jest.fn().mockResolvedValue('1'),
      });

      await service.notifyExecutionFailed(PARAMS);

      expect(mailer.send).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.workspaceAlertSetting.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('disparo por canal', () => {
    it('sem linha de config (workspace nunca configurou): email habilitado por padrao, sem webhook', async () => {
      const { service, mailer } = buildService({ workspaceAlertSetting: null });

      await service.notifyExecutionFailed(PARAMS);

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@example.com',
          subject: expect.stringContaining('Fluxo Teste'),
        }),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('email desabilitado + webhook configurado: so o webhook dispara', async () => {
      const { service, mailer } = buildService({
        workspaceAlertSetting: {
          emailEnabled: false,
          webhookUrl: 'https://hooks.example.com/x',
        },
      });

      await service.notifyExecutionFailed(PARAMS);

      expect(mailer.send).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://hooks.example.com/x',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"event":"execution.failed"'),
        }),
      );
    });

    it('email e webhook habilitados: os dois disparam', async () => {
      const { service, mailer } = buildService({
        workspaceAlertSetting: {
          emailEnabled: true,
          webhookUrl: 'https://hooks.example.com/x',
        },
      });

      await service.notifyExecutionFailed(PARAMS);

      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('email e webhook desabilitados: nenhum canal dispara (mas o throttle ja foi consumido)', async () => {
      const { service, cache, mailer } = buildService({
        workspaceAlertSetting: { emailEnabled: false, webhookUrl: null },
      });

      await service.notifyExecutionFailed(PARAMS);

      expect(mailer.send).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalled();
    });

    it('manda email pra TODOS os membros do workspace', async () => {
      const { service, mailer } = buildService({
        members: [
          { user: { email: 'a@example.com' } },
          { user: { email: 'b@example.com' } },
        ],
      });

      await service.notifyExecutionFailed(PARAMS);

      expect(mailer.send).toHaveBeenCalledTimes(2);
      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@example.com' }),
      );
      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'b@example.com' }),
      );
    });
  });

  describe('resiliencia', () => {
    it('nunca lanca, mesmo se o mailer falhar', async () => {
      const { service, mailer } = buildService();
      mailer.send.mockRejectedValue(new Error('SMTP fora do ar'));

      await expect(
        service.notifyExecutionFailed(PARAMS),
      ).resolves.toBeUndefined();
    });

    it('nunca lanca, mesmo se o Prisma falhar', async () => {
      const { service, prisma } = buildService();
      prisma.workspaceAlertSetting.findUnique.mockRejectedValue(
        new Error('DB fora do ar'),
      );

      await expect(
        service.notifyExecutionFailed(PARAMS),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendTest', () => {
    it('ignora o throttle e manda so pro email de quem pediu', async () => {
      const { service, cache, mailer } = buildService({
        cacheGet: jest.fn().mockResolvedValue('1'), // ja "throttled" — nao deveria importar pro teste
      });

      await service.sendTest({
        workspaceId: 'ws-1',
        toEmail: 'quem-clicou@example.com',
      });

      expect(cache.get).not.toHaveBeenCalled();
      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'quem-clicou@example.com' }),
      );
    });

    it('dispara o webhook de teste quando informado', async () => {
      const { service } = buildService();

      await service.sendTest({
        workspaceId: 'ws-1',
        toEmail: 'quem-clicou@example.com',
        webhookUrl: 'https://hooks.example.com/teste',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://hooks.example.com/teste',
        expect.objectContaining({
          body: expect.stringContaining('"event":"alert.test"'),
        }),
      );
    });
  });
});
