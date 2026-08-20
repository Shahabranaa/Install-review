export type DateTabRebuilder = (dates: string[]) => Promise<number>;

interface DateTabSyncQueueOptions {
  debounceMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * Serializes date-tab rebuilds. A new request received while a rebuild is
 * writing remains pending and is rebuilt from a newer snapshot afterward.
 */
export function createDateTabSyncQueue(
  rebuild: DateTabRebuilder,
  {
    debounceMs = 1_000,
    retryBaseMs = 2_000,
    retryMaxMs = 60_000,
    onError,
  }: DateTabSyncQueueOptions = {},
) {
  const pendingDates = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let activeSync: Promise<number> | null = null;
  let consecutiveFailures = 0;

  function addPendingDates(dates: string[]): void {
    for (const date of dates) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) pendingDates.add(date);
    }
  }

  async function flush(): Promise<number> {
    let syncedRows = 0;

    while (true) {
      if (activeSync) {
        await activeSync;
        continue;
      }

      const dates = [...pendingDates];
      pendingDates.clear();
      if (dates.length === 0) return syncedRows;

      const sync = rebuild(dates);
      activeSync = sync;
      try {
        syncedRows += await sync;
      } catch (error) {
        addPendingDates(dates);
        throw error;
      } finally {
        if (activeSync === sync) activeSync = null;
      }
    }
  }

  function nextRetryDelay(): number {
    const delay = Math.min(retryBaseMs * 2 ** consecutiveFailures, retryMaxMs);
    consecutiveFailures += 1;
    return delay;
  }

  function scheduleFlush(delayMs: number): void {
    if (flushTimer) return;

    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush()
        .then(() => {
          consecutiveFailures = 0;
        })
        .catch((error) => {
          onError?.(error);
          // flush() restores the failed dates to pendingDates. Keep retrying
          // so a temporary Sheets outage does not strand the mirror forever.
          if (pendingDates.size > 0) scheduleFlush(nextRetryDelay());
        });
    }, delayMs);
    flushTimer.unref?.();
  }

  function schedule(...dates: string[]): void {
    addPendingDates(dates);
    scheduleFlush(debounceMs);
  }

  async function syncNow(...dates: string[]): Promise<number> {
    addPendingDates(dates);
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    try {
      const syncedRows = await flush();
      consecutiveFailures = 0;
      return syncedRows;
    } catch (error) {
      if (pendingDates.size > 0) scheduleFlush(nextRetryDelay());
      throw error;
    }
  }

  return { schedule, syncNow };
}