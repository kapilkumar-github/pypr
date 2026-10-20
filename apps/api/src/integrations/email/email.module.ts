import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { ConsoleEmailSender } from './console-email-sender.js';
import { EmailSender } from './email-sender.js';
import { OutboxEmailSender } from './outbox-email-sender.js';
import { ResendEmailSender } from './resend-email-sender.js';

/** Picks the email adapter from EMAIL_PROVIDER. */
@Global()
@Module({
  providers: [
    {
      provide: EmailSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailSender => {
        const email = config.get('EMAIL', { infer: true });
        switch (email.provider) {
          case 'resend':
            return ResendEmailSender.fromApiKey(email.resendApiKey, email.from);
          case 'outbox':
            return new OutboxEmailSender(email.dir);
          case 'console':
            return new ConsoleEmailSender();
        }
      },
    },
  ],
  exports: [EmailSender],
})
export class EmailModule {}
