// ── Short-lived async cache with in-flight de-duplication ───────────────────
//
// Milestone payloads take a second or more to assemble from Jira and every
// open tab polls them. A short TTL collapses those polls (and concurrent
// first loads) into one upstream fetch while staying fresh enough to feel
// live. Failures are never cached: the next call retries.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCacheOptions {
  ttlMs: number;
  /** Upper bound on stored entries; the oldest is evicted first. */
  maxEntries?: number;
  now?: () => number;
}

export interface CacheResult<T> {
  value: T;
  /** "hit" = served from cache, "shared" = joined an in-flight fetch, "miss" = fetched. */
  source: "hit" | "shared" | "miss";
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor({ ttlMs, maxEntries = 200, now = Date.now }: TtlCacheOptions) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Cached value if fresh, else the in-flight fetch for `key`, else a new fetch. */
  async getOrLoad(key: string, load: () => Promise<T>): Promise<CacheResult<T>> {
    const cached = this.get(key);
    if (cached !== undefined) return { value: cached, source: "hit" };

    const pending = this.inFlight.get(key);
    if (pending) return { value: await pending, source: "shared" };

    const promise = load().then(
      (value) => {
        this.set(key, value);
        this.inFlight.delete(key);
        return value;
      },
      (err: unknown) => {
        this.inFlight.delete(key);
        throw err;
      },
    );
    this.inFlight.set(key, promise);
    return { value: await promise, source: "miss" };
  }
}
