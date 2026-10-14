/**
 * Builds an SVG path of PQRST heartbeat complexes. Each entry in `beats` (0–1) sets the
 * height of one R spike, so a strong score draws a tall, confident beat and a weak one a faint flutter.
 */
export function ecgPath(beats: number[], width: number, height: number, baseline = 0.62): string {
  const mid = height * baseline;
  const seg = width / beats.length;
  const n = (v: number) => v.toFixed(1);
  let d = `M0 ${n(mid)}`;
  beats.forEach((amp, i) => {
    const a = Math.max(0.06, amp) * height * 0.55;
    const x = (f: number) => n(i * seg + seg * f);
    d +=
      ` L${x(0.24)} ${n(mid)} Q${x(0.29)} ${n(mid - a * 0.14)} ${x(0.34)} ${n(mid)}` +
      ` L${x(0.41)} ${n(mid)} L${x(0.44)} ${n(mid + a * 0.12)} L${x(0.48)} ${n(mid - a)}` +
      ` L${x(0.52)} ${n(mid + a * 0.3)} L${x(0.56)} ${n(mid)} L${x(0.63)} ${n(mid)}` +
      ` Q${x(0.71)} ${n(mid - a * 0.24)} ${x(0.79)} ${n(mid)} L${x(1)} ${n(mid)}`;
  });
  return d;
}

export type Tone = "healthy" | "watch" | "critical";

/** Lighthouse's own thresholds: 90+ good, 50–89 needs improvement, below 50 poor. */
export function toneFor(score: number | null): Tone {
  if (score == null) return "watch";
  return score >= 90 ? "healthy" : score >= 50 ? "watch" : "critical";
}

export const TONE_TEXT: Record<Tone, string> = { healthy: "Healthy", watch: "Needs work", critical: "Poor" };
