import { Body, Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { MailService } from './mail.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '../common/roles.enum';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/mail')
export class MailController {
  constructor(private mail: MailService, private prisma: PrismaService) {}

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

  // Staff send + store message
  @Post('send')
  @Roles(Role.SUPPORT, Role.ADMIN, Role.OWNER)
  async send(
    @Req() req: any,
    @Body()
    body: {
      to: string;
      subject: string;
      html?: string;
      text?: string;
      fromKind?: 'default' | 'support' | 'no_reply';
    },
  ) {
    const to = (body?.to || '').trim();
    const subject = (body?.subject || '').trim();
    const html = body?.html || '';
    const text = body?.text || undefined;
    const fromKind = body?.fromKind || 'default';
    if (!to || !subject || (!html && !text)) {
      return { ok: false, message: 'to, subject and html or text are required' };
    }
    const userId = req?.user?.userId as number;
    // Resolve staff alias
    const staff = await this.prisma.staffEmail.findFirst({ where: { userId } });
    const fromAlias = staff?.email || (await (async () => {
      const settings = await this.mail.getSettings();
      const domain = ((settings?.supportEmail || settings?.fromEmail || '').split('@')[1] || 'example.com').trim();
      const local = ((settings?.supportEmail || settings?.fromEmail || '').split('@')[0] || 'support');
      return `${local}@${domain}`;
    })());
    // Use real profile data if available
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, title: true } });
    const staffName = [u?.firstName, u?.lastName].filter(Boolean).join(' ') || (req?.user?.email || '').split('@')[0].replace('.', ' ');
    await this.mail.sendStaffOutbound(to, { staffName, staffEmail: fromAlias, subject, messageHtml: html || `<p>${text || ''}</p>`, staffTitle: u?.title || undefined });
    // Store outbound message
    await this.prisma.emailMessage.create({
      data: {
        userId,
        direction: 'outbound' as any,
        from: fromAlias,
        to,
        subject,
        html: html || null,
        text: text || null,
        read: true,
      },
    });
    return { ok: true };
  }

  // Inbox list for current user
  @Get('inbox')
  @Roles(Role.SUPPORT, Role.ADMIN, Role.OWNER)
  async inbox(@Req() req: any) {
    const userId = req?.user?.userId as number;
    const items = await this.prisma.emailMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items };
  }

  // Sender alias for current user
  @Get('alias')
  @Roles(Role.SUPPORT, Role.ADMIN, Role.OWNER)
  async alias(@Req() req: any) {
    const userId = req?.user?.userId as number;
    const staff = await this.prisma.staffEmail.findFirst({ where: { userId } });
    if (staff?.email) return { email: staff.email };
    const settings = await this.mail.getSettings();
    const domain = ((settings?.supportEmail || settings?.fromEmail || '').split('@')[1] || 'example.com').trim();
    const local = ((settings?.supportEmail || settings?.fromEmail || '').split('@')[0] || 'support');
    return { email: `${local}@${domain}` };
  }
}