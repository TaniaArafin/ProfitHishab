import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { config } from '../../config';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends an email. Chosen by `MAIL_DRIVER` in config (laravel-patterns: config-select-deployable-variation):
 * `log` for development and tests, `smtp` for any SMTP service in production.
 */
export abstract class Mailer {
  abstract send(mail: Mail): Promise<void>;
}

/** Writes the email to the API log instead of sending it. Production refuses this driver. */
@Injectable()
export class LogMailer extends Mailer {
  private readonly logger = new Logger('Mail');

  send(mail: Mail): Promise<void> {
    this.logger.log(`Email to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return Promise.resolve();
  }
}

export class SmtpMailer extends Mailer {
  private readonly transport: Transporter;

  constructor(
    smtp: NonNullable<ReturnType<typeof config>['mail']['smtp']>,
    private readonly from: string,
  ) {
    super();
    this.transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? '' } : undefined,
      // Every outbound call has a timeout (laravel-rest-api: client-explicit-timeouts).
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
  }
}

/** The configured mailer, for the module's provider list. */
export function mailerFromConfig(): Mailer {
  const { smtp, from } = config().mail;
  return smtp ? new SmtpMailer(smtp, from) : new LogMailer();
}
