/**
 * Execution timeline — per-phase timestamps for an on-chain operation (Sprint 7D).
 * Captured in-process and surfaced (additively) on the execution detail. Ordering
 * is monotonic by construction (phases are stamped as they occur).
 */
export interface ExecutionTimeline {
  discoveredAt?: string;
  builtAt?: string;
  simulatedAt?: string;
  signedAt?: string;
  submittedAt?: string;
  confirmedAt?: string;
}

export type TimelinePhase = keyof ExecutionTimeline;

export const TIMELINE_PHASES: TimelinePhase[] = [
  "discoveredAt",
  "builtAt",
  "simulatedAt",
  "signedAt",
  "submittedAt",
  "confirmedAt",
];

/** A small recorder that stamps phases with an injectable clock (testable). */
export class TimelineRecorder {
  private readonly timeline: ExecutionTimeline = {};
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  mark(phase: TimelinePhase): this {
    if (!this.timeline[phase]) this.timeline[phase] = this.now();
    return this;
  }

  get(): ExecutionTimeline {
    return { ...this.timeline };
  }
}

/** True if the present phases are in non-decreasing chronological order. */
export function isTimelineOrdered(timeline: ExecutionTimeline): boolean {
  const times = TIMELINE_PHASES.map((p) => timeline[p]).filter((t): t is string => Boolean(t));
  for (let i = 1; i < times.length; i++) {
    if (times[i] < times[i - 1]) return false;
  }
  return true;
}
