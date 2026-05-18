import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exceptions/all-exceptions.filter';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy,
    }),
    {
      bufferLogs: true,
    },
  );

  const configService = app.get(AppConfigService);

  await app.register(cookie, {
    secret: configService.sessionSecret,
  });
  await app.register(helmet);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: configService.frontendOrigin,
    credentials: true,
  });
  // TODO(security): add CSRF protection for cookie-authenticated browser flows once a project-wide pattern is chosen.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(configService.port, '0.0.0.0');
  Logger.log(`Cyber Academy backend listening on ${configService.port}`, 'Bootstrap');
}

void bootstrap();
