import { Logger } from '@nestjs/common';
import { EmailSender, type EmailMessage } from './email-sender.js';

/**
 * Adapter for local development: prints the email (including any links) to the API log
 * instead of sending it. Refused in production by env validation.
 */
export class ConsoleEmailSender extends EmailSender {
  private readonly logger = new Logger('Email');

  send(message: EmailMessage): Promise<void> {
    this.logger.log(`To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
    return Promise.resolve();
  }
}
