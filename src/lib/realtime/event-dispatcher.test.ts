import { describe, expect, it, vi } from "vitest";
import { createEventDispatcher } from "./event-dispatcher";

// `RealtimeServerEvent` is `never` in OPT-353. We exercise the runtime via
// unknown casts; the subscribe/dispatch contract has to work end-to-end so
// migration tickets can drop in event variants without touching this code.
type AnyType = string;
const subscribeAs = <T extends AnyType>(d: ReturnType<typeof createEventDispatcher>, type: T, handler: (e: unknown) => void) =>
  d.subscribe(type as never, handler as never);

describe("createEventDispatcher", () => {
  it("delivers events to subscribers of the matching type", () => {
    const d = createEventDispatcher();
    const onA = vi.fn();
    const onB = vi.fn();

    subscribeAs(d, "feature:a", onA);
    subscribeAs(d, "feature:b", onB);

    d.dispatch({ type: "feature:a", value: 1 });
    d.dispatch({ type: "feature:b", value: 2 });

    expect(onA).toHaveBeenCalledTimes(1);
    expect(onA).toHaveBeenCalledWith({ type: "feature:a", value: 1 });
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledWith({ type: "feature:b", value: 2 });
  });

  it("does not deliver across event types", () => {
    const d = createEventDispatcher();
    const onA = vi.fn();
    subscribeAs(d, "feature:a", onA);

    d.dispatch({ type: "feature:b", value: "x" });

    expect(onA).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers per event type", () => {
    const d = createEventDispatcher();
    const a1 = vi.fn();
    const a2 = vi.fn();

    subscribeAs(d, "feature:a", a1);
    subscribeAs(d, "feature:a", a2);

    d.dispatch({ type: "feature:a" });

    expect(a1).toHaveBeenCalledTimes(1);
    expect(a2).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops delivery and cleans the bucket when empty", () => {
    const d = createEventDispatcher();
    const onA = vi.fn();
    const off = subscribeAs(d, "feature:a", onA);

    expect(d.handlerCount("feature:a")).toBe(1);
    off();
    expect(d.handlerCount("feature:a")).toBe(0);

    d.dispatch({ type: "feature:a" });
    expect(onA).not.toHaveBeenCalled();
  });

  it("handles a handler that unsubscribes itself mid-dispatch", () => {
    const d = createEventDispatcher();
    const onA1 = vi.fn(() => off1());
    const onA2 = vi.fn();
    const off1 = subscribeAs(d, "feature:a", onA1);
    subscribeAs(d, "feature:a", onA2);

    d.dispatch({ type: "feature:a" });

    expect(onA1).toHaveBeenCalledTimes(1);
    expect(onA2).toHaveBeenCalledTimes(1);
    // A second dispatch sees only the survivor.
    d.dispatch({ type: "feature:a" });
    expect(onA1).toHaveBeenCalledTimes(1);
    expect(onA2).toHaveBeenCalledTimes(2);
  });

  it("isolates a throwing handler from its siblings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = createEventDispatcher();
    const bad = vi.fn(() => {
      throw new Error("kaboom");
    });
    const good = vi.fn();

    subscribeAs(d, "feature:a", bad);
    subscribeAs(d, "feature:a", good);

    d.dispatch({ type: "feature:a" });

    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("silently drops unknown event types", () => {
    const d = createEventDispatcher();
    expect(() => d.dispatch({ type: "totally:unknown" })).not.toThrow();
  });

  it("re-subscribing after full unsubscribe re-creates the bucket", () => {
    const d = createEventDispatcher();
    const onA = vi.fn();
    const off = subscribeAs(d, "feature:a", onA);
    off();
    expect(d.handlerCount("feature:a")).toBe(0);

    subscribeAs(d, "feature:a", onA);
    d.dispatch({ type: "feature:a" });
    expect(onA).toHaveBeenCalledTimes(1);
  });
});
