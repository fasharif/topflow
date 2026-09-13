import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Transactional email behind a tiny interface: `console` for development and tests,
 * Resend's HTTP API in production (no SDK dependency). Outside production the last
 * messages are kept in memory so end-to-end tests can follow verification links.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly sent: MailMessage[] = [];

  constructor(@InjectConfig() private readonly config: AppConfig) {}

  async send(message: MailMessage): Promise<void> {
    if (!this.config.isProduction) {
      this.sent.push(message);
      if (this.sent.length > 100) this.sent.shift();
    }

    if (this.config.mail.transport === 'console') {
      if (this.config.env !== 'test') {
        this.logger.log(
          `To: ${message.to} | ${message.subject}\n${message.text}`,
        );
      }
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.mail.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.mail.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      throw new Error(`Mail provider responded with HTTP ${response.status}`);
    }
  }

  /** Development/test helper: most recent message sent to an address. */
  lastMessageTo(email: string): MailMessage | undefined {
    return [...this.sent].reverse().find((message) => message.to === email);
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
