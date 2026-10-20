import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { EmailConfig } from '../../config/env.js';
import { ConsoleEmailSender } from './console-email-sender.js';
import { EmailSender } from './email-sender.js';
import { EmailModule } from './email.module.js';
import { OutboxEmailSender } from './outbox-email-sender.js';
import { ResendEmailSender } from './resend-email-sender.js';

async function senderFor(email: EmailConfig): Promise<EmailSender> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ EMAIL: email })],
      }),
      EmailModule,
    ],
  }).compile();
  return moduleRef.get(EmailSender);
}

describe('EmailModule', () => {
  it('uses the Resend adapter when EMAIL_PROVIDER=resend', async () => {
    const sender = await senderFor({
      provider: 'resend',
      resendApiKey: 're_test',
      from: 'x <a@b.co>',
    });
    expect(sender).toBeInstanceOf(ResendEmailSender);
  });

  it('uses the outbox adapter when EMAIL_PROVIDER=outbox', async () => {
    expect(
      await senderFor({ provider: 'outbox', dir: '/tmp/x', from: 'x <a@b.co>' }),
    ).toBeInstanceOf(OutboxEmailSender);
  });

  it('uses the console adapter otherwise', async () => {
    expect(await senderFor({ provider: 'console', from: 'x <a@b.co>' })).toBeInstanceOf(
      ConsoleEmailSender,
    );
  });
});
