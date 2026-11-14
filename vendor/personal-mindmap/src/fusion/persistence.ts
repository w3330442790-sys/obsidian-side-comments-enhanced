export class SaveConflict extends Error {
  constructor() { super('文件已被其他编辑器修改；本地编辑已保留，请先解决冲突。'); this.name = 'SaveConflict'; }
}

/** Serial compare-and-swap writes. Each queued edit compares against the last successful disk write. */
export class SnapshotWriter {
  private queue: Promise<void> = Promise.resolve();
  private queuedSnapshots = new Map<string, number>();
  pending: string | undefined;
  constructor(private expected: string, private process: (transform: (disk: string) => string) => Promise<unknown>) {}
  write(next: string): Promise<void> {
    this.pending = next;
    this.queuedSnapshots.set(next, (this.queuedSnapshots.get(next) ?? 0) + 1);
    const operation = this.queue.then(async () => {
      await this.process(disk => {
        if (disk !== this.expected && disk !== next) throw new SaveConflict();
        return next;
      });
      this.expected = next;
      if (this.pending === next) this.pending = undefined;
    });
    const tracked = operation.finally(() => {
      const remaining = (this.queuedSnapshots.get(next) ?? 1) - 1;
      if (remaining) this.queuedSnapshots.set(next, remaining); else this.queuedSnapshots.delete(next);
    });
    this.queue = tracked.catch(() => undefined);
    return tracked;
  }
  isOwnSnapshot(source: string): boolean { return source === this.expected || this.queuedSnapshots.has(source); }
  isDirty(source: string): boolean { return source !== this.expected; }
  settled(): Promise<void> { return this.queue; }
}
