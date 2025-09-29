import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QueueService } from './queue.service';
import { JwtService } from '@nestjs/jwt';

@ApiTags('queues')
@Controller('admin/queues')
export class QueueSseController {
  constructor(private queues: QueueService, private jwt: JwtService) {}

  @Get('events')
  async sse(@Query('token') token: string, @Res() res: any) {
    try {
      const payload: any = this.jwt.verify(token);
      const role = payload?.role;
      if (!['ADMIN', 'OWNER'].includes(role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const unsub = this.queues.onEvents((evt) => {
      try {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      } catch {}
    });

    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {}
    }, 25000);

    const onClose = () => {
      clearInterval(ping);
      unsub();
      try { res.end(); } catch {}
    };

    const req = (res as any).req || (res as any).request || undefined;
    if (req && typeof req.on === 'function') {
      req.on('close', onClose);
      req.on('end', onClose);
      req.on('error', onClose);
    } else {
      res.on?.('close', onClose);
    }
  }
}