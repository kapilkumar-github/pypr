import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EmailSender, type EmailMessage } from './email-sender.js';

/**
 * Adapter for end-to-end tests: writes each email as a JSON file in a folder, where the test
 * reads the verification link. Refused in production by env validation.
 */
export class OutboxEmailSender extends EmailSender {
  constructor(private readonly dir: string) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const file = join(this.dir, `${String(Date.now())}-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify({ ...message, sentAt: new Date().toISOString() }), {
      mode: 0o600,
    });
  }
}
