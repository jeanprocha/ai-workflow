import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './observability/all-exceptions.filter';
import { requestIdMiddleware } from './observability/request-id.middleware';

async function bootstrap() {
  // bufferLogs: guarda os logs emitidos entre a criacao da app e o
  // useLogger() abaixo (inclusive erros de bootstrap de outros modulos),
  // em vez de perde-los ou de deixar o Nest usar o console.log default
  // nesse meio-tempo.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // O mais cedo possivel: abre o contexto de correlacao pra TODA a request,
  // inclusive o auto-logging do pino-http (que so escreve no fim da
  // request, ja dentro desta continuacao). Ver request-id.middleware.ts.
  app.use(requestIdMiddleware);
  app.enableCors({ exposedHeaders: ['x-request-id'] });
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
