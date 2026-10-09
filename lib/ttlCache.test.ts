import { describe, expect, it } from "vitest";
import { TtlCache } from "@/lib/ttlCache";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("TtlCache", () => {
  it("serves a fresh value from cache and refetches after the TTL", async () => {
    const c = clock();
    const cache = new TtlCache<number>({ ttlMs: 1000, now: c.now });
    let calls = 0;
    const load = async () => ++calls;

    expect(await cache.getOrLoad("k", load)).toEqual({ value: 1, source: "miss" });
    c.advance(999);
    expect(await cache.getOrLoad("k", load)).toEqual({ value: 1, source: "hit" });
    c.advance(1);
    expect(await cache.getOrLoad("k", load)).toEqual({ value: 2, source: "miss" });
  });

  it("collapses concurrent loads for the same key into one fetch", async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 });
    let calls = 0;
    let release: (v: string) => void = () => {};
    const load = () => {
      calls++;
      return new Promise<string>((r) => (release = r));
    };
    const a = cache.getOrLoad("k", load);
    const b = cache.getOrLoad("k", load);
    release("v");
    expect(await a).toEqual({ value: "v", source: "miss" });
    expect(await b).toEqual({ value: "v", source: "shared" });
    expect(calls).toBe(1);
  });

  it("keeps keys apart", async () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 });
    expect((await cache.getOrLoad("a", async () => "A")).value).toBe("A");
    expect((await cache.getOrLoad("b", async () => "B")).value).toBe("B");
  });

  it("never caches a failure", async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000 });
    await expect(cache.getOrLoad("k", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await cache.getOrLoad("k", async () => 7)).toEqual({ value: 7, source: "miss" });
  });

  it("evicts the oldest entry beyond maxEntries", async () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });
});
