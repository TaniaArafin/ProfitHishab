import { Injectable, Logger } from '@nestjs/common';

/**
 * Sends a text message. Chosen by `SMS_DRIVER` in config (laravel-patterns: config-select-deployable-variation).
 * Only `log` exists until an SMS gateway is chosen; production refuses to start with it.
 */
export abstract class SmsSender {
  abstract send(phone: string, text: string): Promise<void>;
}

/** Writes the message to the API log instead of sending it (development and tests). */
@Injectable()
export class LogSmsSender extends SmsSender {
  private readonly logger = new Logger('SMS');

  send(phone: string, text: string): Promise<void> {
    this.logger.log(`SMS to ${phone}: ${text}`);
    return Promise.resolve();
  }
}
