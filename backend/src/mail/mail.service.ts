import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

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

  private buildFrom(kind: 'default' | 'support' | 'no_reply' = 'default'): string {
    const s = this.cachedSettings!;
    const email =
      kind === 'support'
        ? (s.supportEmail || s.fromEmail)
        : kind === 'no_reply'
        ? (s.noReplyEmail || s.fromEmail)
        : s.fromEmail;
    return s.fromName ? `"${s.fromName}" <${email}>` : email;
  }

  async send(to: string, subject: string, html: string, text?: string, kind: 'default' | 'support' | 'no_reply' = 'default') {
    const tx = await this.getTransporter();
    if (!tx || !this.cachedSettings) {
      this.logger.warn('Skipping email, mail transport unavailable');
      return { skipped: true };
    }
    const from = this.buildFrom(kind);
    await tx.sendMail({
      from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    return { sent: true };
  }

  // Convenience templates
  async sendPaymentSuccess(to: string, amount: string, currency: string, planName?: string, invoiceUrl?: string) {
    const subj = `Payment received${planName ? ` - ${planName}` : ''}`;
    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
        <h2>Thank you for your payment</h2>
        <p>We received your payment of <strong>${amount} ${currency}</strong>${planName ? ` for <strong>${planName}</strong>` : ''}.</p>
        ${invoiceUrl ? `<p>You can view your invoice <a href="${invoiceUrl}">here</a>.</p>` : ''}
        <p>If you have any questions, reply to this email.</p>
      </div>
    `;
    return this.send(to, subj, html);
  }

  async sendPaymentFailed(to: string, planName?: string) {
    const subj = `Payment failed${planName ? ` - ${planName}` : ''}`;
    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
        <h2>We couldn't process your payment</h2>
        <p>${planName ? `For plan <strong>${planName}</strong>, ` : ''}your recent payment attempt failed.</p>
        <p>Please update your payment method in the billing portal.</p>
      </div>
    `;
    return this.send(to, subj, html);
  }

  async sendSubscribed(to: string, planName: string) {
    const subj = `Subscription activated - ${planName}`;
    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
        <h2>You're subscribed</h2>
        <p>Your subscription to <strong>${planName}</strong> is active.</p>
      </div>
    `;
    return this.send(to, subj, html);
  }

  async sendCanceled(to: string, planName?: string) {
    const subj = `Subscription canceled${planName ? ` - ${planName}` : ''}`;
    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
        <h2>Subscription canceled</h2>
        <p>Your subscription${planName ? ` to <strong>${planName}</strong>` : ''} has been canceled.</p>
      </div>
    `;
    return this.send(to, subj, html);
  }

  async sendPastDueReminder(to: string, planName: string | undefined, graceUntil: Date) {
    const subj = `Payment required${planName ? ` - ${planName}` : ''}`;
    const leftHours = Math.max(1, Math.round((graceUntil.getTime() - Date.now()) / 3600000));
    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
        <h2>Your subscription is past due</h2>
        <p>${planName ? `For plan <strong>${planName}</strong>, ` : ''}your subscription is currently past due.</p>
        <p>Please update your payment method to avoid cancellation. Approximately <strong>${leftHours} hour(s)</strong> remain before cancellation.</p>
      </div>
    `;
    return this.send(to, subj, html);
  }
}