import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, raw } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // Security headers
  app.use(helmet());

  // Add raw body parser for Stripe webhooks before global json
  // Use */* to be robust to any content-type variations
  app.use('/api/webhooks/stripe', raw({ type: '*/*' }));
  // JSON body for the rest, but preserve raw body for Stripe route
  app.use(json({
    verify: (req: any, _res, buf) => {
      const url = req.originalUrl || req.url || '';
      if (url.startsWith('/api/webhooks/stripe')) {
        req.rawBody = buf;
      }
    },
  }));

  // CORS restricted to configured frontend URL
  const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.enableCors({
    origin: [frontend],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Hosting Platform API')
    .setDescription('REST API for the hosting platform MVP')
    .setVersion('0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API running at http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();