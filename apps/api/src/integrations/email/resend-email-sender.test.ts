import { describe, expect, it, vi } from 'vitest';
import { EmailDeliveryError } from './email-sender.js';
import { ResendEmailSender, type ResendEmails } from './resend-email-sender.js';

const message = {
  to: 'ada@example.com',
  subject: 'Hello',
  html: '<p>secret link</p>',
  text: 'secret link',
  idempotencyKey: 'verify-email/123',
};

function fakeEmails(result: SendResult | Error) {
  const send = vi.fn<ResendEmails['send']>(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  return { emails: { send } satisfies ResendEmails, send };
}

type SendResult = Awaited<ReturnType<ResendEmails['send']>>;
const ok: SendResult = { data: { id: 'email_1' }, error: null, headers: null };

describe('ResendEmailSender', () => {
  it('maps the message to a Resend send call with the configured sender', async () => {
    const { emails, send } = fakeEmails(ok);
    await new ResendEmailSender(emails, 'Pypr <no-reply@send.pypr.work>').send(message);
    expect(send).toHaveBeenCalledWith(
      {
        from: 'Pypr <no-reply@send.pypr.work>',
        to: ['ada@example.com'],
        subject: 'Hello',
        html: '<p>secret link</p>',
        text: 'secret link',
      },
      { idempotencyKey: 'verify-email/123' },
    );
  });

  it('throws EmailDeliveryError when Resend rejects, without the message body', async () => {
    const rejected: SendResult = {
      data: null,
      error: { name: 'validation_error', message: 'Domain not verified', statusCode: 403 },
      headers: null,
    };
    const { emails } = fakeEmails(rejected);
    const sending = new ResendEmailSender(emails, 'Pypr <no-reply@send.pypr.work>').send(message);
    await expect(sending).rejects.toThrow(EmailDeliveryError);
    await expect(sending).rejects.toThrow(/validation_error.*Domain not verified/);
    await expect(sending).rejects.not.toThrow(/secret link/);
  });

  it('throws EmailDeliveryError when Resend cannot be reached', async () => {
    const { emails } = fakeEmails(new Error('fetch failed'));
    await expect(new ResendEmailSender(emails, 'x <a@b.co>').send(message)).rejects.toThrow(
      EmailDeliveryError,
    );
  });
});
