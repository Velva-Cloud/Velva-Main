import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('mail')
@Controller('mail/inbound')
export class MailInboundController {
  constructor(private prisma: PrismaService) {}

  // Basic inbound webhook to receive parsed emails (e.g., from SendGrid Inbound Parse)
  // Configure your provider to POST to /api/mail/inbound with fields: to, from, subject, html, text
  @Post()
  async receive(@Req() req: any, @Body() body: any) {
    try {
      const toField = String(body?.to || '').toLowerCase();
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