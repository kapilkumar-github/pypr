import { resumeContentSchema, type ResumeContent } from '@pypr/resume-core';

export type SaveStatus =
  | 'saved' // server has the latest content
  | 'pending' // changes waiting for the debounce
  | 'saving'
  | 'invalid' // content fails validation; fix the highlighted fields
  | 'retrying' // a save failed (network/server); trying again
  | 'conflict'; // saved elsewhere since our revision; autosave stopped

export class ConflictError extends Error {
  override readonly name = 'ConflictError';
}

export interface AutosaverOptions {
  revision: number;
  /** Saves content based on `revision`; resolves with the new revision. Throw ConflictError on 409. */
  save: (content: ResumeContent, revision: number, keepalive: boolean) => Promise<number>;
  onStatus: (status: SaveStatus) => void;
  delayMs?: number;
  retryDelaysMs?: readonly number[];
}

/**
 * Saves the latest resume content after a pause in typing. One save at a time; edits made
 * during a save are saved right after it, on top of the new revision. Framework-free so it
 * can be tested with fake timers.
 */
export class Autosaver {
  private revision: number;
  private latest: ResumeContent | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private failures = 0;
  private stopped = false;
  private status: SaveStatus = 'saved';
  private readonly delayMs: number;
  private readonly retryDelaysMs: readonly number[];

  constructor(private readonly options: AutosaverOptions) {
    this.revision = options.revision;
    this.delayMs = options.delayMs ?? 800;
    this.retryDelaysMs = options.retryDelaysMs ?? [2_000, 5_000, 10_000, 30_000];
  }

  get currentStatus(): SaveStatus {
    return this.status;
  }

  get currentRevision(): number {
    return this.revision;
  }

  /** True while something isn't on the server yet. */
  get hasUnsavedChanges(): boolean {
    return this.latest !== null || this.inFlight !== null;
  }

  /** Call on every edit. */
  update(content: ResumeContent): void {
    if (this.stopped) return;
    this.latest = content;
    if (!resumeContentSchema.safeParse(content).success) {
      this.clearTimer();
      this.setStatus('invalid');
      return;
    }
    if (this.inFlight) return; // saved right after the current request
    this.failures = 0;
    this.setStatus('pending');
    this.schedule(this.delayMs);
  }

  /** Saves now instead of waiting (tab hidden or closing). */
  flush(options: { keepalive?: boolean } = {}): Promise<void> {
    this.clearTimer();
    return this.run(options.keepalive ?? false);
  }

  dispose(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private schedule(ms: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(false);
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(keepalive: boolean): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const content = this.latest;
    if (!content || this.stopped) return;
    if (!resumeContentSchema.safeParse(content).success) {
      this.setStatus('invalid');
      return;
    }

    this.latest = null;
    this.setStatus('saving');
    this.inFlight = (async () => {
      try {
        this.revision = await this.options.save(content, this.revision, keepalive);
        this.failures = 0;
      } catch (error) {
        if (error instanceof ConflictError) {
          this.stopped = true;
          this.latest ??= content;
          this.setStatus('conflict');
          return;
        }
        // Keep the newest content: ours, unless the user typed more meanwhile.
        this.latest ??= content;
        const delay =
          this.retryDelaysMs[Math.min(this.failures, this.retryDelaysMs.length - 1)] ?? 30_000;
        this.failures += 1;
        this.setStatus('retrying');
        this.schedule(delay);
        return;
      } finally {
        this.inFlight = null;
      }

      if (this.latest) {
        // Edited while saving.
        if (resumeContentSchema.safeParse(this.latest).success) {
          this.setStatus('pending');
          this.schedule(0);
        } else {
          this.setStatus('invalid');
        }
      } else {
        this.setStatus('saved');
      }
    })();
    return this.inFlight;
  }

  private setStatus(status: SaveStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }
}
