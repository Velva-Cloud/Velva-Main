import { Body, Controller, Post, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@ApiTags('mail')
@Controller('mail/inbound')
export class MailInboundController {
  constructor(private prisma: PrismaService) {}

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
      const toEmail = (toField.split(',')[0] || '').trim();
      const local = (toEmail.split('@')[0] || '').trim();
      const domain = (toEmail.split('@')[1] || '').trim();

      if (!local || !domain) {
        return { ok: false, message: 'Invalid recipient' };
      }

      const staff = await this.prisma.staffEmail.findUnique({ where: { local_domain: { local, domain } } } as any);
      if (!staff) {
        // Unknown recipient; optionally drop or store in a catch-all
        return { ok: false, message: 'Recipient not recognized' };
      }

      const from = String(body?.from || '').trim();
      const subject = String(body?.subject || '').trim();
      const html = body?.html ? String(body.html) : null;
      const text = body?.text ? String(body.text) : (html ? html.replace(/<[^>]+>/g, '') : null);

      await this.prisma.emailMessage.create({
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

      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Failed' };
    }
  }
}