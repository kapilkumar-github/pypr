import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes with argon2id and the configured cost', async () => {
    const hash = await passwords.hash('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await passwords.hash('correct horse battery');
    expect(await passwords.verify(hash, 'correct horse battery')).toBe(true);
    expect(await passwords.verify(hash, 'Correct horse battery')).toBe(false);
  });

  it('salts each hash', async () => {
    expect(await passwords.hash('same password')).not.toBe(await passwords.hash('same password'));
  });

  it('returns false for a missing hash (unknown user) or a malformed one', async () => {
    expect(await passwords.verify(null, 'anything at all')).toBe(false);
    expect(await passwords.verify('not-a-hash', 'anything at all')).toBe(false);
  });
});
