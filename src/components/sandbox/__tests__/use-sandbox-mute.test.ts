import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SANDBOX_MUTE_DEFAULT,
  SANDBOX_MUTE_STORAGE_KEY,
  readSandboxMutePreference,
  writeSandboxMutePreference,
} from "../use-sandbox-mute";

// vitest runs in `environment: "node"`, so localStorage is undefined unless
// we install a stub. The pure helpers are designed to survive both states:
// these tests cover the "storage present" path; the "storage absent"
// fall-through is exercised by leaving the stub uninstalled.

interface MemoryStorage extends Storage {
  __store: Map<string, string>;
}

function createMemoryStorage(): MemoryStorage {
  const store = new Map<string, string>();
  const storage = {
    __store: store,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  return storage as MemoryStorage;
}

describe("readSandboxMutePreference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the default when localStorage is absent", () => {
    // No stub installed — globalThis.localStorage is undefined under node.
    expect(readSandboxMutePreference()).toBe(SANDBOX_MUTE_DEFAULT);
  });

  it("returns true when storage holds 'true'", () => {
    const storage = createMemoryStorage();
    storage.setItem(SANDBOX_MUTE_STORAGE_KEY, "true");
    vi.stubGlobal("localStorage", storage);
    expect(readSandboxMutePreference()).toBe(true);
  });

  it("returns false when storage holds 'false'", () => {
    const storage = createMemoryStorage();
    storage.setItem(SANDBOX_MUTE_STORAGE_KEY, "false");
    vi.stubGlobal("localStorage", storage);
    expect(readSandboxMutePreference()).toBe(false);
  });

  it("falls back to default for unrecognized values", () => {
    const storage = createMemoryStorage();
    storage.setItem(SANDBOX_MUTE_STORAGE_KEY, "unmuted");
    vi.stubGlobal("localStorage", storage);
    expect(readSandboxMutePreference()).toBe(SANDBOX_MUTE_DEFAULT);
  });

  it("falls back to default when getItem throws", () => {
    const throwing: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => {
        throw new Error("blocked");
      },
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    };
    vi.stubGlobal("localStorage", throwing);
    expect(readSandboxMutePreference()).toBe(SANDBOX_MUTE_DEFAULT);
  });
});

describe("writeSandboxMutePreference", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists true as 'true'", () => {
    writeSandboxMutePreference(true);
    expect(storage.getItem(SANDBOX_MUTE_STORAGE_KEY)).toBe("true");
  });

  it("persists false as 'false'", () => {
    writeSandboxMutePreference(false);
    expect(storage.getItem(SANDBOX_MUTE_STORAGE_KEY)).toBe("false");
  });

  it("read after write round-trips", () => {
    writeSandboxMutePreference(false);
    expect(readSandboxMutePreference()).toBe(false);
    writeSandboxMutePreference(true);
    expect(readSandboxMutePreference()).toBe(true);
  });

  it("swallows setItem errors instead of throwing", () => {
    const throwing: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error("quota");
      },
    };
    vi.stubGlobal("localStorage", throwing);
    expect(() => writeSandboxMutePreference(false)).not.toThrow();
  });
});

describe("SANDBOX_MUTE_DEFAULT", () => {
  it("is muted by default per OPT-297 acceptance", () => {
    expect(SANDBOX_MUTE_DEFAULT).toBe(true);
  });
});
