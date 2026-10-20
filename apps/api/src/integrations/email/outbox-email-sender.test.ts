import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { OutboxEmailSender } from './outbox-email-sender.js';

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('OutboxEmailSender', () => {
  it('writes each email as a JSON file', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'pypr-outbox-')), 'nested');
    dirs.push(dir);
    await new OutboxEmailSender(dir).send({
      to: 'a@b.co',
      subject: 'Hi',
      html: '<p>x</p>',
      text: 'x',
    });
    const [file] = await readdir(dir);
    const saved = JSON.parse(await readFile(join(dir, file ?? ''), 'utf8')) as { to: string };
    expect(saved).toMatchObject({ to: 'a@b.co', subject: 'Hi', text: 'x' });
  });
});
