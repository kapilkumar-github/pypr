import { Resend } from 'resend';
import { EmailDeliveryError, EmailSender, type EmailMessage } from './email-sender.js';

/** The slice of the Resend SDK this adapter uses; tests pass a fake. */
export type ResendEmails = Pick<Resend['emails'], 'send'>;

/** Adapter: sends through Resend (https://resend.com). */
export class ResendEmailSender extends EmailSender {
  constructor(
    private readonly emails: ResendEmails,
    private readonly from: string,
  ) {
    super();
  }

  static fromApiKey(apiKey: string, from: string): ResendEmailSender {
    return new ResendEmailSender(new Resend(apiKey).emails, from);
  }

  async send(message: EmailMessage): Promise<void> {
    let result: Awaited<ReturnType<ResendEmails['send']>>;
    try {
      result = await this.emails.send(
        {
          from: this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        },
        message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined,
      );
    } catch (error) {
      throw new EmailDeliveryError('Could not reach Resend', { cause: error });
    }
    if (result.error) {
      throw new EmailDeliveryError(
        `Resend rejected the email (${result.error.name}): ${result.error.message}`,
      );
    }
  }
}
