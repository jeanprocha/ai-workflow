import type { Params } from 'nestjs-pino';
import { getContext } from './request-context';

/**
 * Config do pino compartilhada por API e worker (LoggerModule.forRootAsync em
 * observability.module.ts). Le process.env dentro desta funcao (chamada pela
 * factory do Nest, nunca no corpo de um decorator) — ver load-env.ts sobre a
 * armadilha de ordem de import.
 */
export function createLoggerParams(): Params {
  const level = process.env.LOG_LEVEL ?? 'info';
  // Pretty por padrao fora de producao; LOG_PRETTY=0 desliga (ex.: prod local
  // testando o formato JSON). Em producao de verdade (Railway) ninguem seta
  // LOG_PRETTY=1, entao o pino-pretty (devDependency) nunca e referenciado.
  const pretty = process.env.LOG_PRETTY
    ? process.env.LOG_PRETTY === '1'
    : process.env.NODE_ENV !== 'production';

  return {
    pinoHttp: {
      level,
      transport: pretty
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      // Injeta o contexto de correlacao (requestId, executionId, etc.) em
      // TODO log emitido durante a request/job atual, sem precisar passar
      // manualmente em cada chamada de logger.
      mixin: () => getContext() ?? {},
      // Escopo deliberadamente estreito: so os headers HTTP que realmente
      // carregam segredo. pino-http nao loga req.body/res.body por padrao
      // (so headers), entao um wildcard tipo '*.password' nao protege nada
      // ali — so atinge os NOSSOS proprios logs estruturados (execution.log,
      // etc.), onde ja causou um falso positivo real: o node logic.log
      // manda `{ value }` como payload, e um `'*.value'` de teste redagiu o
      // proprio conteudo que o usuario pediu pra logar. Nodes de automacao
      // lidam com dado arbitrario do usuario — um campo chamado "token" ali
      // pode ser dado de negocio legitimo, nao credencial da plataforma. Se
      // precisar redigir algo especifico de um payload de node no futuro,
      // prefira um path exato (ex.: 'payload.apiKey') a um wildcard largo.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[Redacted]',
      },
      // Health/metrics sao poludos por natureza (scrape a cada poucos
      // segundos) — nao vale a pena logar cada request delas.
      autoLogging: {
        ignore: (req) => {
          const url = req.url ?? '';
          return url.startsWith('/health') || url === '/metrics';
        },
      },
    },
  };
}
