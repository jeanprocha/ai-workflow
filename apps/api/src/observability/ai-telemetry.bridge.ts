import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { setTelemetryHandler, type AiTelemetryEvent } from '@workflow/ai';
import { MetricsService } from './metrics.service';

const RATE_LIMIT_WARN_THRESHOLD_MS = 5000;

/**
 * Ponte entre packages/ai (framework-agnostic, so emite eventos via
 * emitTelemetry) e a observabilidade do NestJS (log estruturado + metricas
 * Prometheus). setTelemetryHandler e um registro GLOBAL por processo — API e
 * worker cada um chama isto uma vez no proprio bootstrap (via
 * ObservabilityModule, @Global()), cobrindo tanto as chamadas de IA feitas
 * dentro da engine (nodes ai.*, rodando no worker) quanto as feitas pelos
 * endpoints de Autocomplete/Copilot/Debugger/Agents/Knowledge (rodando na API).
 */
@Injectable()
export class AiTelemetryBridgeService implements OnModuleInit {
  constructor(
    private readonly logger: Logger,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit() {
    setTelemetryHandler((event) => this.handle(event));
  }

  private handle(event: AiTelemetryEvent): void {
    const model = event.model ?? 'unknown';

    this.metrics.aiCallDuration.observe(
      { provider: event.provider, model, operation: event.operation },
      event.durationMs / 1000,
    );
    if (event.waitMs > 0) {
      this.metrics.aiRateLimitWaitSeconds.observe(
        { provider: event.provider },
        event.waitMs / 1000,
      );
    }
    if (event.usage) {
      if ('inputTokens' in event.usage) {
        this.metrics.aiTokensTotal.inc(
          { provider: event.provider, model, direction: 'input' },
          event.usage.inputTokens,
        );
        this.metrics.aiTokensTotal.inc(
          { provider: event.provider, model, direction: 'output' },
          event.usage.outputTokens,
        );
      } else {
        this.metrics.aiTokensTotal.inc(
          { provider: event.provider, model, direction: 'input' },
          event.usage.tokens,
        );
      }
    }
    if (event.costUsd) {
      this.metrics.aiCostUsdTotal.inc(
        { provider: event.provider, model },
        event.costUsd,
      );
    }

    const logPayload = {
      provider: event.provider,
      operation: event.operation,
      model: event.model,
      durationMs: event.durationMs,
      waitMs: event.waitMs,
      costUsd: event.costUsd,
    };

    if (!event.ok) {
      this.logger.error({ ...logPayload, err: event.error }, 'ai.call.error');
    } else {
      this.logger.log(logPayload, 'ai.call');
    }

    if (event.waitMs > RATE_LIMIT_WARN_THRESHOLD_MS) {
      this.logger.warn(
        logPayload,
        `ai.call esperou ${event.waitMs}ms por um slot do rate limiter (provider=${event.provider}) — throttling visivel`,
      );
    }
  }
}
