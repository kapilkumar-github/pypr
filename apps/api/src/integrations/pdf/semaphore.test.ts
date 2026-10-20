import { describe, expect, it } from 'vitest';
import { Semaphore } from './semaphore.js';

describe('Semaphore', () => {
  it('never runs more than the limit at once, and runs everything', async () => {
    const semaphore = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const job = async (n: number) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return n;
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => semaphore.run(() => job(n))));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  it('frees the slot when a job fails', async () => {
    const semaphore = new Semaphore(1);
    await expect(semaphore.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await semaphore.run(() => Promise.resolve('ok'))).toBe('ok');
  });
});
