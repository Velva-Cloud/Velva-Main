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

  // Ensure a panel client certificate exists if requested
  try {
    const pki = app.get(PkiService);
    await pki.ensurePanelClientCertIfRequested();
  } catch {
    // ignore
  }

  // Bull Board UI (RBAC: ADMIN/OWNER only)
  try {
    const express = app.getHttpAdapter().getInstance();
    const jwt = app.get(JwtService);
    const queues = app.get(QueueService) as QueueService;
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/api/admin/queues/ui');

    const { addQueue, removeQueue } = createBullBoard({
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
    // eslint-disable-next-line no-console
    console.log('Bull Board available at /api/admin/queues/ui');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('Bull Board init skipped:', (e as any)?.message || e);
  }

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API running at http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();