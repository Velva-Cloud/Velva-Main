import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, raw } from 'express';
import { PkiService } from './common/pki.service';
import { JwtService } from '@nestjs/jwt';
import { QueueService } from './queue/queue.service';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
// Use require to avoid CJS/ESM interop issues with cookie-parser in Node20 CJS build
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require('cookie-parser');
// csurf types may not be present at build; import as any-compatible
// eslint-disable-next-line @typescript-eslint/no-var-requires
const csurf = require('csurf');
import * as client from 'prom-client';

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
        (req as any).rawBody = buf;
      }
    },
  }));

  // CORS restricted to configured frontend URL(s)
  // Support comma-separated list of allowed origins
  const frontendEnv = process.env.FRONTEND_URL || 'http://localhost:3000';
  const origins = frontendEnv.split(',').map(s => s.trim()).filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
  });

  // CSRF for cookie-posted web forms only (not for API JWT requests)
  const express = app.getHttpAdapter().getInstance();
  express.use('/web', cookieParser());
  express.use('/web', csurf({ cookie: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger (disabled by default in production)
  const enableSwagger = (process.env.ENABLE_SWAGGER === 'true') || process.env.NODE_ENV !== 'production';
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('Hosting Platform API')
      .setDescription('REST API for the hosting platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Ensure a panel client certificate exists if requested
  try {
    const pki = app.get(PkiService);
    await pki.ensurePanelClientCertIfRequested();
  } catch {
    // ignore
  }

  // Prometheus metrics (disabled by default in production)
  const enableMetrics = (process.env.ENABLE_METRICS === 'true') || process.env.NODE_ENV !== 'production';
  if (enableMetrics) {
    try {
      client.collectDefaultMetrics();
      express.get('/metrics', async (_req: any, res: any) => {
        try {
          res.set('Content-Type', client.register.contentType);
          res.end(await client.register.metrics());
        } catch (e: any) {
          res.status(500).json({ error: e?.message || 'metrics_error' });
        }
      });
    } catch {
      // ignore metrics init errors
    }
  }

  // Bull Board UI (RBAC: ADMIN/OWNER only)
  try {
    const jwt = app.get(JwtService);
    const queues = app.get(QueueService) as QueueService;
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/api/admin/queues/ui');

    const { addQueue } = createBullBoard({
      queues: [],
      serverAdapter,
    });

    // Register queues from QueueService
    const qDefs = await queues.listQueues();
    qDefs.forEach(def => {
      const q = (queues as any)[`${def.name}Q`];
      if (q) addQueue(new BullMQAdapter(q));
    });

    // JWT + role check middleware
    const authMiddleware = (req: any, res: any, next: any) => {
      try {
        const auth = req.headers['authorization'] || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!token) return res.status(401).json({ error: 'unauthorized' });
        const payload: any = jwt.verify(token);
        const role = payload?.role;
        if (!['ADMIN', 'OWNER'].includes(role)) return res.status(403).json({ error: 'forbidden' });
        next();
      } catch {
        return res.status(401).json({ error: 'unauthorized' });
      }
    };

    express.use('/api/admin/queues/ui', authMiddleware, serverAdapter.getRouter());
  } catch {
    // Bull Board init skipped
  }

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();