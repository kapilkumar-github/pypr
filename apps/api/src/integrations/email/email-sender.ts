/**
 * Port for sending email. Domain code depends on this class only; provider SDKs stay inside
 * their adapter (decision D13). The abstract class doubles as the Nest injection token.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Lets the provider drop duplicates when a send is retried. */
  idempotencyKey?: string;
}

export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<void>;
}

/** The provider didn't accept the message. Never includes the message body. */
export class EmailDeliveryError extends Error {
  override readonly name = 'EmailDeliveryError';
}
