import { randomBytes } from 'node:crypto';
import { hash, verify, type Options } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

// argon2id (the library default) with OWASP's baseline: 19 MiB memory, 2 passes, 1 lane.
const OPTIONS: Options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordService {
  /** Verified against when the account doesn't exist, so both cases take the same time. */
  private readonly dummyHash = hash(randomBytes(16).toString('hex'), OPTIONS);

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  /** False for a missing hash (unknown user or provider-only account) after the same work. */
  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    const target = passwordHash ?? (await this.dummyHash);
    try {
      const matches = await verify(target, password);
      return passwordHash !== null && matches;
    } catch {
      return false;
    }
  }
}
