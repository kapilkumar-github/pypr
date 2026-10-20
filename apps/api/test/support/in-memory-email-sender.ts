import {
  EmailDeliveryError,
  EmailSender,
  type EmailMessage,
} from '../../src/integrations/email/email-sender.js';

/** Test adapter: keeps sent emails in memory, and can be told to fail. */
export class InMemoryEmailSender extends EmailSender {
  readonly sent: EmailMessage[] = [];
  failNext = false;

  send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new EmailDeliveryError('simulated failure'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The most recent email to this address. */
  lastTo(to: string): EmailMessage | undefined {
    return this.sent.findLast((message) => message.to === to);
  }

  countTo(to: string): number {
    return this.sent.filter((message) => message.to === to).length;
  }
}
