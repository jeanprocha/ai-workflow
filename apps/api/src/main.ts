import './load-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './observability/all-exceptions.filter';

async function bootstrap() {
  // bufferLogs: guarda os logs emitidos entre a criacao da app e o
  // useLogger() abaixo (inclusive erros de bootstrap de outros modulos),
  // em vez de perde-los ou de deixar o Nest usar o console.log default
  // nesse meio-tempo.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
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
