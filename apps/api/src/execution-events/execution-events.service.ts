import { Injectable, type MessageEvent } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';

export type ExecutionEvent =
  | { type: 'execution.started'; executionId: string }
  | { type: 'step.started'; executionId: string; nodeId: string }
  | {
      type: 'step.completed';
      executionId: string;
      nodeId: string;
      status: 'success' | 'failed';
      output?: unknown;
      error?: string;
    }
  | {
      type: 'log.created';
      executionId: string;
      nodeId: string | null;
      level: string;
      event: string;
      payload?: unknown;
    }
  | {
      type: 'execution.completed';
      executionId: string;
      status: 'success' | 'failed';
    };

/**
 * Pub/sub em processo para progresso de execucao (ADR-003).
 * v1: worker roda no mesmo processo da API, entao um EventEmitter basta.
 * Se a execucao virar multi-processo (Fase 10), trocar por Redis pub/sub aqui.
 */
@Injectable()
export class ExecutionEventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(event: ExecutionEvent) {
    this.emitter.emit(event.executionId, event);
  }

  subscribe(executionId: string, listener: (event: ExecutionEvent) => void) {
    this.emitter.on(executionId, listener);
    return () => this.emitter.off(executionId, listener);
  }

  toObservable(executionId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.subscribe(executionId, (event) => {
        subscriber.next({ data: event });
        if (event.type === 'execution.completed') subscriber.complete();
      });
      return unsubscribe;
    });
  }
}
