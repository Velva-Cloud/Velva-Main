import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { MailService } from './mail.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/mail')
export class MailController {
  constructor(private mail: MailService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER)
  async get() {
    return this.mail.getSettings();
  }

  @Post()
  @Roles(Role.ADMIN, Role.OWNER)
  async save(
    @Body()
    body: {
      host: string;
      port: number;
      secure: boolean;
      user?: string;
      pass?: string;
      fromEmail: string;
      fromName?: string;
      supportEmail?: string;
      noReplyEmail?: string;
    },
  ) {
    return this.mail.saveSettings({
      host: body.host,
      port: Number(body.port),
      secure: Boolean(body.secure),
      user: body.user || undefined,
      pass: body.pass || undefined,
      fromEmail: body.fromEmail,
      fromName: body.fromName || undefined,
      supportEmail: body.supportEmail || undefined,
      noReplyEmail: body.noReplyEmail || undefined,
    });
  }

  @Post('test')
  @Roles(Role.ADMIN, Role.OWNER)
  async test(@Body() body: { to: string }) {
    const to = (body?.to || '').trim();
    if (!to) {
      return { ok: false, message: 'Recipient is required' };
    }
    await this.mail.send(to, 'Test email from VelvaCloud', '<p>This is a test email confirming your SMTP settings.</p>');
    return { ok: true };
  }

  @Post('send')
  @Roles(Role.ADMIN, Role.OWNER)
  async send(@Body() body: { to: string; subject: string; html?: string; text?: string; fromKind?: 'default' | 'support' | 'no_reply' }) {
    const to = (body?.to || '').trim();
    const subject = (body?.subject || '').trim();
    const html = body?.html || '';
    const text = body?.text || undefined;
    const fromKind = body?.fromKind || 'default';
    if (!to || !subject || (!html && !text)) {
      return { ok: false, message: 'to, subject and html or text are required' };
    }
    await this.mail.send(to, subject, html || (text as string), text, fromKind);
    return { ok: true };
  }
}