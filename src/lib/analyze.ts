import { fetchPage, inspectPage } from "./inspect";
import { aiInsights, ruleInsights } from "./insights";
import { llmProvider, modelLabel } from "./llm";
import { runLighthouse, type LighthouseResult } from "./pagespeed";
import { assertPublicHost } from "./url";
import type { Category, Finding, Insights, Report, Scores, StepId } from "./types";

const CATEGORIES: Category[] = ["performance", "accessibility", "best-practices", "seo"];
const PENALTY = { critical: 18, warning: 8, info: 2 } as const;

/** Rough per-category scores from our own inspection, used only when Lighthouse is unavailable. */
function estimateScores(findings: Finding[]): Scores {
  const scores = {} as Scores;
  for (const c of CATEGORIES) {
    const penalty = findings.filter((f) => f.category === c).reduce((sum, f) => sum + PENALTY[f.severity], 0);
    scores[c] = Math.max(0, Math.min(100, 100 - penalty));
  }
  // Rendering speed can't be judged from the HTML alone, so performance stays unmeasured rather than guessed.
  scores.performance = null;
  return scores;
}

export function overallScore(scores: Scores): number {
  const values = Object.values(scores).filter((s): s is number => s != null);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}

export async function analyze(url: URL, onStep: (step: StepId, status: "start" | "done") => void): Promise<Report> {
  await assertPublicHost(url.hostname);
  const notes: string[] = [];

  onStep("lighthouse", "start");
  const lighthouse: Promise<LighthouseResult | null> = runLighthouse(url.toString())
    .catch((err: unknown) => {
      console.warn("[lighthouse]", err);
      notes.push("Google Lighthouse couldn't test this page right now, so scores are estimated from SiteDoctor's own inspection and performance isn't scored. Run the checkup again to retry.");
      return null;
    })
    .finally(() => onStep("lighthouse", "done"));

  onStep("fetch", "start");
  const page = await fetchPage(url);
  onStep("fetch", "done");

  onStep("inspect", "start");
  const inspection = await inspectPage(page);
  onStep("inspect", "done");

  const lh = await lighthouse;
  const findings = [...inspection.findings, ...(lh?.findings ?? [])];
  const scores = lh ? lh.scores : estimateScores(inspection.findings);
  const overall = overallScore(scores);
  const base = {
    url: url.toString(),
    scores,
    scoreSource: lh ? ("lighthouse" as const) : ("estimated" as const),
    metrics: lh?.metrics ?? [],
    findings,
    page: inspection.facts,
  };

  onStep("ai", "start");
  let insights: Insights;
  let insightsSource: Report["insightsSource"] = "rules";
  let insightsModel: string | null = null;
  const provider = llmProvider();
  if (provider) {
    try {
      insights = await aiInsights(base, provider);
      insightsSource = "ai";
      insightsModel = modelLabel(provider);
    } catch (err) {
      console.warn(`[ai:${provider}]`, err);
      insights = ruleInsights(base, overall);
      notes.push("The AI treatment plan couldn't be generated, so this plan is built from the findings directly.");
    }
  } else {
    insights = ruleInsights(base, overall);
  }
  onStep("ai", "done");

  return {
    version: 1,
    ...base,
    finalUrl: page.finalUrl.toString(),
    checkedAt: new Date().toISOString(),
    overall,
    insights,
    insightsSource,
    insightsModel,
    screenshot: lh?.screenshot ?? null,
    notes,
  };
}
