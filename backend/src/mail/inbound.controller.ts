import { Body, Controller, Get, Post, Req, UploadedFiles, UseInterceptors, Logger } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@ApiTags('mail')
@Controller('mail/inbound')
export class MailInboundController {
  private readonly logger = new Logger(MailInboundController.name);

  constructor(private prisma: PrismaService) {}

  // Simple health check for GET (useful to verify proxy routing)
  @Get()
  health() {
    return { ok: true, service: 'mail-inbound' };
  }

  // Inbound webhook to receive parsed emails (e.g., from SendGrid Inbound Parse)
  // Accepts application/json, x-www-form-urlencoded, and multipart/form-data
  // Expected fields: to, from, subject, html, text. Attachments ignored for now.
  @Post()
  @UseInterceptors(FileFieldsInterceptor([{ name: 'attachments', maxCount: 20 }]))
  async receive(@Req() req: any, @Body() body: any, @UploadedFiles() files: Record<string, any[]>) {
    try {
      // Normalize "to"
      let toField = String(body?.to || '').toLowerCase();
      // SendGrid may send an "envelope" JSON with "to"
      if (!toField && body?.envelope) {
        try {
          const env = JSON.parse(body.envelope);
          if (env?.to && Array.isArray(env.to) && env.to.length) {
            toField = String(env.to[0]).toLowerCase();
          }
        } catch {}
      }

      const from = String(body?.from || '').trim();
      const subject = String(body?.subject || '').trim();

      // Lightweight log for diagnostics (avoid huge payloads)
      await this.prisma.log.create({
        data: {
          userId: null,
          action: 'plan_change' as any,
          metadata: {
            event: 'inbound_received',
            provider: 'sendgrid',
            toRaw: (body?.to || null),
            envelope: body?.envelope || null,
            from: from || null,
            subject: subject || null,
            contentType: req.headers['content-type'] || null,
          },
        },
      });

      const toEmail = (toField.split(',')[0] || '').trim();
      const local = (toEmail.split('@')[0] || '').trim();
      const domain = (toEmail.split('@')[1] || '').trim();

      if (!local || !domain) {
        await this.prisma.log.create({
          data: {
            userId: null,
            action: 'plan_change' as any,
            metadata: { event: 'inbound_invalid_recipient', toField },
          },
        });
        return { ok: false, message: 'Invalid recipient' };
      }

      const staff = await this.prisma.staffEmail.findUnique({ where: { local_domain: { local, domain } } } as any);
      if (!staff) {
        await this.prisma.log.create({
          data: {
            userId: null,
            action: 'plan_change' as any,
            metadata: { event: 'inbound_unknown_recipient', toEmail, local, domain },
          },
        });
        // Unknown recipient; optionally drop or store in a catch-all
        return { ok: false, message: 'Recipient not recognized' };
      }

      const html = body?.html ? String(body.html) : null;
      const text = body?.text ? String(body.text) : (html ? html.replace(/<[^>]+>/g, '') : null);

      const saved = await this.prisma.emailMessage.create({
        data: {
          userId: staff.userId,
          direction: 'inbound' as any,
          from: from || 'unknown',
          to: toEmail,
          subject: subject || '(no subject)',
          html,
          text,
          read: false,
        },
      });

      await this.prisma.log.create({
        data: {
          userId: staff.userId,
          action: 'plan_change' as any,
          metadata: { event: 'inbound_stored', messageId: saved.id, to: toEmail, from: from || null },
        },
      });

      return { ok: true };
    } catch (e: any) {
      this.logger.error(`Inbound handler failed: ${e?.message || e}`);
      await this.prisma.log.create({
        data: {
          userId: null,
          action: 'plan_change' as any,
          metadata: { event: 'inbound_error', error: e?.message || String(e) },
        },
      });
      return { ok: false, message: e?.message || 'Failed' };
    }
  }
}