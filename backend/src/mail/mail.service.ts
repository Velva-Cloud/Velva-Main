import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';

type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromEmail: string;
  fromName?: string;
  supportEmail?: string;
  noReplyEmail?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private cachedSettings: MailSettings | null = null;

  constructor(private prisma: PrismaService) {}

  async getSettings(): Promise<MailSettings | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'mail' } });
    return (row?.value as any) || null;
  }

  async saveSettings(settings: MailSettings) {
    await this.prisma.setting.upsert({
      where: { key: 'mail' },
      create: { key: 'mail', value: settings as any },
      update: { value: settings as any },
    });
    // Reset transporter to pick up new config
    this.transporter = null;
    this.cachedSettings = null;
    return { ok: true };
  }

  private async getTransporter(): Promise<Transporter | null> {
    if (this.transporter) return this.transporter;
    const settings = await this.getSettings();
    if (!settings?.host || !settings?.fromEmail) {
      this.logger.warn('Mail settings not configured');
      return null;
    }
    this.cachedSettings = settings;
    this.transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.user && settings.pass ? { user: settings.user, pass: settings.pass } : undefined,
    });
    try {
      await this.transporter.verify();
    } catch (e: any) {
      this.logger.warn(`Mail transport verification failed: ${e?.message || e}`);
    }
    return this.transporter;
  }

  private buildFrom(kind: 'default' | 'support' | 'no_reply' = 'default', fromLocal?: string): string {
    const s = this.cachedSettings!;
    // Base identity by kind
    let baseEmail =
      kind === 'support'
        ? (s.supportEmail || s.fromEmail)
        : kind === 'no_reply'
        ? (s.noReplyEmail || s.fromEmail)
        : s.fromEmail;

    // Optional override local-part for support identity
    if (fromLocal && kind === 'support') {
      const simple = fromLocal.trim().toLowerCase();
      // Allow letters, numbers, dot, dash, underscore
      if (!/^[a-z0-9._-]{1,64}$/.test(simple)) {
        this.logger.warn(`Invalid local-part for custom from: ${fromLocal}`);
      } else {
        const domain = (baseEmail.split('@')[1] || 'example.com').trim();
        baseEmail = `${simple}@${domain}`;
      }
    }

    return s.fromName ? `\"${s.fromName}\" <${baseEmail}>` : baseEmail;
  }

  async send(
    to: string,
    subject: string,
    html: string,
    text?: string,
    opts?: { kind?: 'default' | 'support' | 'no_reply'; fromLocal?: string; fromOverride?: string; replyTo?: string },
  ) {
    const tx = await this.getTransporter();
    if (!tx || !this.cachedSettings) {
      this.logger.warn('Skipping email, mail transport unavailable');
      return { skipped: true };
    }
    const kind = opts?.kind || 'default';
    const from = opts?.fromOverride && opts.fromOverride.includes('@')
      ? (this.cachedSettings?.fromName ? `"${this.cachedSettings.fromName}" <${opts.fromOverride}>` : opts.fromOverride)
      : this.buildFrom(kind, opts?.fromLocal);
    await tx.sendMail({
      from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
      replyTo: opts?.replyTo || undefined,
    });
    return { sent: true };
  }

  // Templating
  private compileTemplate(name: string, context: Record<string, any>): { subject: string; html: string; text: string } {
    // Resolve templates in a robust way for both dev (src) and prod (dist)
    const candidateBaseDirs = [
      path.join(__dirname, 'templates'),                             // dist runtime: /dist/src/mail/templates
      path.join(process.cwd(), 'dist', 'src', 'mail', 'templates'),  // prod alternative
      path.join(process.cwd(), 'src', 'mail', 'templates'),          // dev: ts-node
    ];

    const resolveExisting = (rel: string): string | null => {
      for (const base of candidateBaseDirs) {
        const full = path.join(base, rel);
        if (fs.existsSync(full)) return full;
      }
      return null;
    };

    const layoutPath = resolveExisting('layout.hbs');
    const tplPath = resolveExisting(`${name}.hbs`);
    if (!layoutPath || !tplPath) {
      this.logger.warn(`Template not found: layout=${layoutPath} tpl=${tplPath}`);
      throw new Error('Email templates not found');
    }

    const layoutSrc = fs.readFileSync(layoutPath, 'utf8');
    const tplSrc = fs.readFileSync(tplPath, 'utf8');
    const bodyTpl = Handlebars.compile(tplSrc);
    const bodyHtml = bodyTpl(context);
    const layoutTpl = Handlebars.compile(layoutSrc);
    const html = layoutTpl({ subject: context.subject || '', body: bodyHtml, year: new Date().getFullYear() });
    const text = bodyHtml.replace(/<[^>]+>/g, '');
    const subject = context.subject || 'Notification';
    return { subject, html, text };
  }

  // Basic sanitizer to keep HTML simple and reduce spam risk
  private sanitizeHtmlForEmail(html: string): string {
    let h = html || '';
    // Remove <script> tags and event handlers
    h = h.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    h = h.replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, '');
    // Strip style attributes to avoid excessive inline styles
    h = h.replace(/\sstyle\s*=\s*["'][^"']*["']/gi, '');
    // Normalize images: limit to width and auto height
    h = h.replace(/<img([^>]*?)>/gi, (m, attrs) => {
      // Remove data URLs
      if (/src\s*=\s*["']data:/i.test(attrs)) return '';
      // Ensure https links
      attrs = attrs.replace(/src\s*=\s*["']http:\/\//i, 'src="https://');
      // Add safe sizing
      if (!/width=|height=|style=/.test(attrs)) {
        attrs += ' style="max-width:600px;height:auto"';
      }
      return `<img${attrs}>`;
    });
    // Prefer https in links
    h = h.replace(/href\s*=\s*["']http:\/\//gi, 'href="https://');
    return h;
  }

  // Staff outbound template sender
  async sendStaffOutbound(to: string, context: { staffName: string; staffEmail: string; subject: string; messageHtml: string; staffTitle?: string; companyName?: string; disclaimer?: string }) {
    const safeBody = this.sanitizeHtmlForEmail(context.messageHtml);
    const { html, text } = this.compileTemplate('staff_outbound', {
      ...context,
      messageHtml: safeBody,
      companyName: context.companyName || 'Your Company',
      staffTitle: context.staffTitle || 'Support',
      disclaimer: context.disclaimer || 'This message may contain confidential information intended only for the recipient. If you received it in error, please notify the sender and delete it.',
    });
    return this.send(to, context.subject, html, text, { kind: 'support', fromOverride: context.staffEmail, replyTo: context.staffEmail });
  }

  // Convenience templates
  async sendPaymentSuccess(to: string, amount: string, currency: string, planName?: string, invoiceUrl?: string) {
    const subject = `Payment received${planName ? ` - ${planName}` : ''}`;
    const { html, text } = this.compileTemplate('generic', {
      subject,
      body: `
        <h2>Thank you for your payment</h2>
        <p>We received your payment of <strong>${amount} ${currency}</strong>${planName ? ` for <strong>${planName}</strong>` : ''}.</p>
        ${invoiceUrl ? `<p>You can view your invoice <a href="${invoiceUrl}">here</a>.</p>` : ''}
        <p>If you have any questions, reply to this email.</p>
      `,
    });
    return this.send(to, subject, html, text, { kind: 'support' });
  }

  async sendPaymentFailed(to: string, planName?: string) {
    const subject = `Payment failed${planName ? ` - ${planName}` : ''}`;
    const { html, text } = this.compileTemplate('generic', {
      subject,
      body: `
        <h2>We couldn't process your payment</h2>
        <p>${planName ? `For plan <strong>${planName}</strong>, ` : ''}your recent payment attempt failed.</p>
        <p>Please update your payment method in the billing portal.</p>
      `,
    });
    return this.send(to, subject, html, text, { kind: 'support' });
  }

  async sendSubscribed(to: string, planName: string) {
    const subject = `Subscription activated - ${planName}`;
    const { html, text } = this.compileTemplate('generic', {
      subject,
      body: `
        <h2>You're subscribed</h2>
        <p>Your subscription to <strong>${planName}</strong> is active.</p>
      `,
    });
    return this.send(to, subject, html, text, { kind: 'support' });
  }

  async sendCanceled(to: string, planName?: string) {
    const subject = `Subscription canceled${planName ? ` - ${planName}` : ''}`;
    const { html, text } = this.compileTemplate('generic', {
      subject,
      body: `
        <h2>Subscription canceled</h2>
        <p>Your subscription${planName ? ` to <strong>${planName}</strong>` : ''} has been canceled.</p>
      `,
    });
    return this.send(to, subject, html, text, { kind: 'support' });
  }

  async sendPastDueReminder(to: string, planName: string | undefined, graceUntil: Date) {
    const subject = `Payment required${planName ? ` - ${planName}` : ''}`;
    const leftHours = Math.max(1, Math.round((graceUntil.getTime() - Date.now()) / 3600000));
    const { html, text } = this.compileTemplate('generic', {
      subject,
      body: `
        <h2>Your subscription is past due</h2>
        <p>${planName ? `For plan <strong>${planName}</strong>, ` : ''}your subscription is currently past due.</p>
        <p>Please update your payment method to avoid cancellation. Approximately <strong>${leftHours} hour(s)</strong> remain before cancellation.</p>
      `,
    });
    return this.send(to, subject, html, text, { kind: 'support' });
  }

  async sendServerCreated(to: string, context: { name: string; planName: string; nodeName: string; dashboardUrl: string }) {
    const subject = `Your server \\\"${context.name}\\\" has been created`;
    const { html, text } = this.compileTemplate('server_created', { ...context, subject });
    return this.send(to, subject, html, text, { kind: 'no_reply' });
  }
}