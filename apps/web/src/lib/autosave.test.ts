import { createResumeContent, updateBasics, type ResumeContent } from '@pypr/resume-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosaver, ConflictError, type SaveStatus } from './autosave';

const base = createResumeContent({ title: 'CV', template: 'classic' });
const named = (name: string) => updateBasics(base, { fullName: name });
const invalid = { ...base, basics: { ...base.basics, fullName: 'x'.repeat(500) } };

function setup(save: (c: ResumeContent, r: number) => Promise<number>) {
  const statuses: SaveStatus[] = [];
  const saver = new Autosaver({
    revision: 1,
    save,
    onStatus: (s) => statuses.push(s),
    delayMs: 800,
    retryDelaysMs: [1_000, 5_000],
  });
  return { saver, statuses };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Autosaver', () => {
  it('saves once after typing pauses, with the latest content', async () => {
    const save = vi.fn((_: ResumeContent, revision: number) => Promise.resolve(revision + 1));
    const { saver, statuses } = setup(save);
    saver.update(named('A'));
    await vi.advanceTimersByTimeAsync(500);
    saver.update(named('Ad'));
    saver.update(named('Ada'));
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].basics.fullName).toBe('Ada');
    expect(saver.currentRevision).toBe(2);
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
    expect(saver.hasUnsavedChanges).toBe(false);
  });

  it('never runs two saves at once, and saves edits made during a save on the new revision', async () => {
    let resolve: (r: number) => void = () => undefined;
    const save = vi.fn(
      (_: ResumeContent, _revision: number) =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    const { saver } = setup(save);
    saver.update(named('A'));
    await vi.advanceTimersByTimeAsync(800);
    saver.update(named('AB'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).toHaveBeenCalledTimes(1);

    resolve(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].basics.fullName).toBe('AB');
    expect(save.mock.calls[1]?.[1]).toBe(2);
    resolve(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.currentStatus).toBe('saved');
  });

  it('holds invalid content back until it is fixed', async () => {
    const save = vi.fn((_: ResumeContent, r: number) => Promise.resolve(r + 1));
    const { saver } = setup(save);
    saver.update(invalid);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).not.toHaveBeenCalled();
    expect(saver.currentStatus).toBe('invalid');
    expect(saver.hasUnsavedChanges).toBe(true);

    saver.update(named('Fixed'));
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('retries failed saves with backoff, keeping the newest content', async () => {
    const save = vi
      .fn((_: ResumeContent, r: number) => Promise.resolve(r + 1))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'));
    const { saver, statuses } = setup(save);
    saver.update(named('A'));
    await vi.advanceTimersByTimeAsync(800);
    expect(saver.currentStatus).toBe('retrying');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(saver.currentStatus).toBe('saved');
    expect(statuses).toContain('retrying');
  });

  it('stops for good on a conflict', async () => {
    const save = vi.fn(() => Promise.reject(new ConflictError('409')));
    const { saver } = setup(save);
    saver.update(named('A'));
    await vi.advanceTimersByTimeAsync(800);
    expect(saver.currentStatus).toBe('conflict');
    saver.update(named('B'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.hasUnsavedChanges).toBe(true);
  });

  it('flush saves immediately', async () => {
    const save = vi.fn((_: ResumeContent, r: number) => Promise.resolve(r + 1));
    const { saver } = setup(save);
    saver.update(named('A'));
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
