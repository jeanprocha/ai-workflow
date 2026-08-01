import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './observability/all-exceptions.filter';
import { requestIdMiddleware } from './observability/request-id.middleware';
import { resolveCorsOrigin } from './cors-origin';

async function bootstrap() {
  // bufferLogs: guarda os logs emitidos entre a criacao da app e o
  // useLogger() abaixo (inclusive erros de bootstrap de outros modulos),
  // em vez de perde-los ou de deixar o Nest usar o console.log default
  // nesse meio-tempo.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // Atras do proxy do Railway (e de qualquer LB/CDN na frente da API): sem
  // isso, req.ip sempre resolve pro IP do proxy, e o ThrottlerGuard (H1.1)
  // rate-limitaria todo mundo junto como um unico cliente.
  app.set('trust proxy', 1);
  // O mais cedo possivel: abre o contexto de correlacao pra TODA a request,
  // inclusive o auto-logging do pino-http (que so escreve no fim da
  // request, ja dentro desta continuacao). Ver request-id.middleware.ts.
  app.use(requestIdMiddleware);
  app.use(helmet({ contentSecurityPolicy: false })); // API nao serve HTML
  app.enableCors({
    origin: resolveCorsOrigin(logger),
    exposedHeaders: ['x-request-id'],
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  await app.listen(process.env.PORT ?? 3333);
}
void bootstrap();
