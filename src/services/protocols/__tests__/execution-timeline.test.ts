import { describe, it, expect } from "vitest";
import {
  TimelineRecorder,
  isTimelineOrdered,
  TIMELINE_PHASES,
} from "@/services/protocols/execution-timeline";

describe("execution timeline", () => {
  it("stamps phases in chronological order (injectable clock)", () => {
    let t = 0;
    const clock = () => new Date(1_000_000 + t++ * 1000).toISOString();
    const rec = new TimelineRecorder(clock);

    for (const phase of TIMELINE_PHASES) rec.mark(phase);
    const tl = rec.get();

    expect(Object.keys(tl)).toHaveLength(6);
    expect(isTimelineOrdered(tl)).toBe(true);
    expect(tl.discoveredAt! < tl.confirmedAt!).toBe(true);
  });

  it("does not overwrite an already-stamped phase (idempotent)", () => {
    let t = 0;
    const clock = () => `t${t++}`;
    const rec = new TimelineRecorder(clock);
    rec.mark("builtAt");
    const first = rec.get().builtAt;
    rec.mark("builtAt");
    expect(rec.get().builtAt).toBe(first);
  });

  it("detects an out-of-order timeline", () => {
    expect(isTimelineOrdered({ discoveredAt: "2026-01-02", confirmedAt: "2026-01-01" })).toBe(false);
  });
});
