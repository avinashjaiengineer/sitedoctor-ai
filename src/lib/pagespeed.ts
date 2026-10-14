import type { Category, Finding, Metric, Scores, Severity } from "./types";
import { INSPECTION_COVERS } from "./inspect";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORIES: Category[] = ["performance", "accessibility", "best-practices", "seo"];
const METRICS: [string, string][] = [
  ["largest-contentful-paint", "Largest Contentful Paint"],
  ["cumulative-layout-shift", "Cumulative Layout Shift"],
  ["total-blocking-time", "Total Blocking Time"],
  ["first-contentful-paint", "First Contentful Paint"],
  ["speed-index", "Speed Index"],
];
const MAX_FINDINGS_PER_CATEGORY = 8;
// Timing metrics that Lighthouse files outside the "metrics" group; they aren't actionable findings.
const METRIC_AUDITS = new Set(["interactive", "max-potential-fid", "first-meaningful-paint"]);

interface LhAudit {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
  details?: { type?: string; data?: string };
}
interface LhCategory {
  score: number | null;
  auditRefs: { id: string; weight: number; group?: string }[];
}
interface PsiResponse {
  lighthouseResult?: {
    finalDisplayedUrl?: string;
    categories: Record<string, LhCategory>;
    audits: Record<string, LhAudit>;
  };
  error?: { message?: string };
}

export interface LighthouseResult {
  scores: Scores;
  metrics: Metric[];
  findings: Finding[];
  screenshot: string | null;
}

/** Turns "Foo. [Learn more](https://…)." into "Foo." */
function cleanDescription(text = ""): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)\.?/g, (_, label: string) => (/learn/i.test(label) ? "" : label))
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function severityFor(audit: LhAudit, weight: number, category: Category): Severity {
  const score = audit.score ?? 0;
  if (category === "performance") return score < 0.5 ? "warning" : "info";
  if (score === 0 && weight >= 7) return "critical";
  return score < 0.5 ? "warning" : "info";
}

/** Runs Lighthouse, retrying once on Google-side flakiness (not on quota or key errors) if time allows. */
export async function runLighthouse(url: string, budgetMs = 85_000): Promise<LighthouseResult> {
  const started = Date.now();
  try {
    return await runOnce(url, 55_000);
  } catch (err) {
    const remaining = budgetMs - (Date.now() - started);
    const message = err instanceof Error ? err.message : "";
    if (remaining < 25_000 || /quota|api key|API_KEY|permission/i.test(message)) throw err;
    console.warn("[lighthouse] retrying after:", message);
    return runOnce(url, remaining);
  }
}

async function runOnce(url: string, timeoutMs: number): Promise<LighthouseResult> {
  const params = new URLSearchParams({ url, strategy: "mobile" });
  for (const c of CATEGORIES) params.append("category", c);
  if (process.env.PAGESPEED_API_KEY) params.set("key", process.env.PAGESPEED_API_KEY);

  const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
  const data = (await res.json()) as PsiResponse;
  if (!res.ok || !data.lighthouseResult) {
    throw new Error(data.error?.message ?? `PageSpeed Insights returned ${res.status}`);
  }
  const { categories, audits } = data.lighthouseResult;

  const scores = Object.fromEntries(
    CATEGORIES.map((c) => [c, categories[c]?.score == null ? null : Math.round(categories[c].score! * 100)]),
  ) as Scores;

  const metrics: Metric[] = METRICS.filter(([id]) => audits[id]).map(([id, label]) => ({
    id,
    label,
    value: audits[id].displayValue ?? "—",
    score: audits[id].score,
  }));

  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const category of CATEGORIES) {
    const failing = (categories[category]?.auditRefs ?? [])
      .filter((ref) => ref.group !== "metrics" && !METRIC_AUDITS.has(ref.id) && !seen.has(ref.id) && !INSPECTION_COVERS.has(ref.id))
      .map((ref) => ({ ref, audit: audits[ref.id] }))
      .filter(({ audit }) => audit && audit.score !== null && audit.score < 0.9 && ["binary", "numeric", "metricSavings"].includes(audit.scoreDisplayMode))
      .sort((a, b) => b.ref.weight - a.ref.weight || (a.audit.score ?? 0) - (b.audit.score ?? 0))
      .slice(0, MAX_FINDINGS_PER_CATEGORY);

    for (const { ref, audit } of failing) {
      seen.add(ref.id);
      findings.push({
        id: `lh-${audit.id}`,
        category,
        severity: severityFor(audit, ref.weight, category),
        title: (audit.displayValue ? `${audit.title} (${audit.displayValue})` : audit.title).replace(/`/g, ""),
        detail: cleanDescription(audit.description),
        source: "lighthouse",
      });
    }
  }

  const shot = audits["final-screenshot"]?.details;
  const screenshot = shot?.type === "screenshot" && shot.data?.startsWith("data:image/") ? shot.data : null;

  return { scores, metrics, findings, screenshot };
}
