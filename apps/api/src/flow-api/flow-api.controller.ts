import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { EXECUTION_PHASE, type ExecutionStatus } from '@workflow/shared';
import { ExecutionsService } from '../executions/executions.service';
import { Public } from '../auth/decorators/public.decorator';
import { FlowApiKeyGuard } from './guards/flow-api-key.guard';
import { ExecutionWaiter, clampTimeoutMs } from './execution-waiter';

interface ExecutionEnvelopeSource {
  id: string;
  status: string;
  versionId: string;
  outputPayload: unknown;
  error: string | null;
  durationMs: number | null;
}

function envelope(execution: ExecutionEnvelopeSource) {
  return {
    executionId: execution.id,
    status: execution.status,
    versionId: execution.versionId,
    output: execution.outputPayload ?? null,
    error: execution.error,
    durationMs: execution.durationMs,
  };
}

// H2-06: "nao terminal" (derivado de EXECUTION_PHASE), nao mais uma
// allowlist manual de ['queued', 'running'] — essa allowlist desacoplada da
// de execution-waiter.ts era exatamente o bug do H2-04: uma execucao
// waiting_approval nao caia nem em "terminal" nem em "pending", e o invoke
// sincrono devolvia HTTP 200 com output:null pra uma execucao so pausada.
function isTerminal(status: string): boolean {
  return EXECUTION_PHASE[status as ExecutionStatus] === 'terminal';
}

/**
 * Endpoint publico de fluxo publicado como API (H2-04). @Public() na classe
 * escapa do JwtAuthGuard global (autenticacao e por FlowApiKeyGuard, Bearer
 * wfk_...) — precedente de @Public() na classe inteira e novo neste repo
 * (os controllers publicos existentes marcam rota a rota), mas aqui TODAS
 * as rotas do controller sao publicas por natureza.
 *
 * @Throttle proprio: sem isso, o ThrottlerGuard global (100/min por IP pra
 * API inteira) mataria antes do limite por chave (isFlowApiRateLimited)
 * conseguir se aplicar.
 */
@Public()
@Controller('v1/flows')
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@UseGuards(FlowApiKeyGuard)
export class FlowApiController {
  constructor(
    private readonly executions: ExecutionsService,
    private readonly waiter: ExecutionWaiter,
  ) {}

  /**
   * Sincrono por padrao (o caso de uso — "pergunta e resposta na mesma
   * chamada", ex.: busca da Rein embutida no site) exige devolver o
   * resultado). Degrada pra 202 (sem esperar) quando o cliente pede
   * `?mode=async` OU o cap de waiters em voo (FLOW_API_MAX_SYNC_WAITERS)
   * estourou — nesse caso a resposta e so o "aceito", com a URL do GET pra
   * quem quer buscar o resultado depois.
   */
  @Post(':workflowId/invoke')
  @HttpCode(HttpStatus.OK)
  async invoke(
    @Param('workflowId') workflowId: string,
    @Body() body: unknown,
    @Query('mode') mode: string | undefined,
    @Query('timeoutMs') timeoutMsRaw: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const execution = await this.executions.triggerByApiKey(
      workflowId,
      body ?? {},
    );
    const resultUrl = `/v1/flows/${workflowId}/executions/${execution.id}`;

    if (mode === 'async' || !this.waiter.hasCapacity()) {
      res.status(HttpStatus.ACCEPTED);
      return { ...envelope(execution), resultUrl };
    }

    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    const result = await this.waiter.wait(
      execution.id,
      clampTimeoutMs(timeoutMsRaw),
      () => aborted,
    );

    if (!result || !isTerminal(result.status)) {
      res.status(HttpStatus.ACCEPTED);
      return { ...envelope(result ?? execution), resultUrl };
    }

    res.status(HttpStatus.OK);
    return envelope(result);
  }

  @Get(':workflowId/executions/:executionId')
  async getExecution(
    @Param('workflowId') workflowId: string,
    @Param('executionId') executionId: string,
  ) {
    const execution = await this.executions.findByApiKey(
      workflowId,
      executionId,
    );
    return envelope(execution);
  }
}
