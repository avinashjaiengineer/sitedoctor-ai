import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { createAzureOpenAIClient, createClaudeClient, createGeminiClient, isClaude, modelFor, type ClaudeProvider, type Provider } from "./llm";
import { CATEGORY_LABELS, type Category, type Finding, type Insights, type Level, type Metric, type PageFacts, type Scores } from "./types";

const level = z.enum(["high", "medium", "low"]);
const InsightsSchema = z.object({
  verdict: z.string().describe("One plain-language sentence, at most 20 words, summing up the site's health."),
  summary: z.string().describe("2–4 sentences for a non-technical site owner: overall state, biggest risk, biggest opportunity."),
  priorities: z
    .array(
      z.object({
        title: z.string().describe("Imperative action, at most 10 words."),
        category: z.enum(["performance", "accessibility", "best-practices", "seo"]),
        impact: level,
        effort: level,
        why: z.string().describe("One or two sentences on the business or user impact."),
        how: z.string().describe("Concrete steps specific to this site, 2–4 sentences."),
      }),
    )
    .describe("3 to 6 items, most valuable first."),
  quickWins: z.array(z.string()).describe("3 to 5 fixes that take under an hour each."),
  strengths: z.array(z.string()).describe("1 to 4 things the site already does well."),
});

const SYSTEM = `You are SiteDoctor, a senior web consultant who specialises in performance, technical SEO, accessibility and web security.
You receive automated audit data for one web page (Lighthouse results plus an HTML and header inspection) and write a treatment plan for the site owner.

Guidelines:
- Ground every recommendation in the supplied data. Reference specific numbers, elements or headers from it; never invent findings.
- Order priorities by value: severity and user impact weighed against effort. Merge related findings into one priority rather than listing each.
- Write for a capable but non-specialist owner: plain words, no jargon without a short explanation, no filler or hype.
- If scores are estimated because Lighthouse was unavailable, don't over-claim about performance.
- Strengths should be real positives visible in the data (good scores, headers present, fast response), not generic praise.`;

export interface InsightInput {
  url: string;
  scores: Scores;
  scoreSource: "lighthouse" | "estimated";
  metrics: Metric[];
  findings: Finding[];
  page: PageFacts;
}

/** Plain-language labels and units, so the model quotes "HTML size: 715 KB" rather than raw field names. */
function readablePage(p: PageFacts) {
  const known = (v: boolean | null) => (v == null ? "couldn't check" : v ? "yes" : "no");
  return {
    "Page title": p.title ?? "missing",
    "Meta description": p.description ?? "missing",
    "Main headings (h1)": p.h1s.length ? p.h1s : "none",
    "Declared language": p.lang ?? "not declared",
    "Canonical URL": p.canonical ?? "missing",
    "HTTP status": p.statusCode,
    "Server response time": `${p.responseTimeMs} ms`,
    "HTML size": `${Math.round(p.htmlBytes / 1024)} KB`,
    "Served over HTTPS": p.https ? "yes" : "no",
    "Redirects before the page": p.redirects,
    "Words of visible text": p.wordCount,
    "Images": p.imageCount,
    "Images without alt text": p.imagesMissingAlt,
    "Links": p.linkCount,
    "External scripts": p.scriptCount,
    "robots.txt present": known(p.hasRobotsTxt),
    "XML sitemap present": known(p.hasSitemap),
    "Structured data present": p.hasStructuredData ? "yes" : "no",
    "Server software": p.server ?? "not disclosed",
  };
}

function userPrompt(input: InsightInput): string {
  const payload = {
    url: input.url,
    scoreSource: input.scoreSource,
    scores: input.scores,
    coreWebVitals: input.metrics.map(({ label, value }) => ({ label, value })),
    page: readablePage(input.page),
    findings: input.findings.map(({ category, severity, title, detail }) => ({ category, severity, title, detail })),
  };
  return `Audit data:\n<audit>\n${JSON.stringify(payload)}\n</audit>\n\nWrite the treatment plan.`;
}

/** Same prompt and schema for every provider; the schema is enforced by each API's structured-output mode. */
export async function aiInsights(input: InsightInput, provider: Provider): Promise<Insights> {
  const out = isClaude(provider) ? await claudePlan(input, provider) : provider === "gemini" ? await geminiPlan(input) : await azureOpenAIPlan(input);
  return { ...out, priorities: out.priorities.slice(0, 6), quickWins: out.quickWins.slice(0, 5), strengths: out.strengths.slice(0, 4) };
}

async function claudePlan(input: InsightInput, provider: ClaudeProvider): Promise<Insights> {
  const response = await createClaudeClient(provider).beta.messages.parse({
    model: modelFor(provider),
    max_tokens: 8000,
    // Server-side refusal fallback exists only on the first-party API; elsewhere a refusal falls back to the rules-based plan.
    ...(provider === "anthropic" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    output_config: { effort: "low", format: betaZodOutputFormat(InsightsSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt(input) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Claude returned no plan (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

async function geminiPlan(input: InsightInput): Promise<Insights> {
  const response = await createGeminiClient().models.generateContent({
    model: modelFor("gemini"),
    contents: userPrompt(input),
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(InsightsSchema),
      maxOutputTokens: 8000,
      abortSignal: AbortSignal.timeout(50_000),
    },
  });
  if (!response.text) throw new Error(`Gemini returned no plan (finish reason: ${response.candidates?.[0]?.finishReason})`);
  return InsightsSchema.parse(JSON.parse(response.text));
}

async function azureOpenAIPlan(input: InsightInput): Promise<Insights> {
  const completion = await createAzureOpenAIClient().chat.completions.parse({
    model: modelFor("azure-openai"),
    max_completion_tokens: 8000,
    reasoning_effort: "low",
    response_format: zodResponseFormat(InsightsSchema, "treatment_plan"),
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt(input) },
    ],
  });
  const message = completion.choices[0]?.message;
  if (!message?.parsed) throw new Error(`Azure OpenAI returned no plan (finish reason: ${completion.choices[0]?.finish_reason}${message?.refusal ? `, refusal: ${message.refusal}` : ""})`);
  return message.parsed;
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

/** Deterministic plan used when no model is configured or the model call fails. */
export function ruleInsights(input: InsightInput, overall: number): Insights {
  const ranked = [...input.findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const impact: Record<Finding["severity"], Level> = { critical: "high", warning: "medium", info: "low" };

  const priorities = ranked.slice(0, 5).map((f) => ({
    title: f.title,
    category: f.category,
    impact: impact[f.severity],
    effort: (f.source === "inspection" ? "low" : "medium") as Level,
    why: f.detail,
    how: f.fix ?? "Run Lighthouse in Chrome DevTools and expand this audit to see the exact elements and resources involved.",
  }));
  const quickWins = ranked.filter((f) => f.source === "inspection" && f.fix).slice(0, 5).map((f) => f.fix!);

  const scored = (Object.entries(input.scores) as [Category, number | null][]).filter(([, s]) => s != null) as [Category, number][];
  const strengths = scored.filter(([, s]) => s >= 90).map(([c, s]) => `${CATEGORY_LABELS[c]} scores ${s}/100.`);
  if (input.page.https) strengths.push("The site is served securely over HTTPS.");
  if (input.page.responseTimeMs < 600) strengths.push(`The server responds quickly (${input.page.responseTimeMs} ms).`);

  const criticals = input.findings.filter((f) => f.severity === "critical").length;
  const weakest = scored.sort((a, b) => a[1] - b[1])[0];
  const verdict =
    overall >= 90 ? "In good health, with a few refinements worth making." : overall >= 50 ? "Basically healthy, but several issues are holding it back." : "Needs attention: serious issues are affecting visitors and search visibility.";

  return {
    verdict,
    summary: `The page scores ${overall}/100 overall${weakest ? `, with ${CATEGORY_LABELS[weakest[0]].toLowerCase()} the weakest area at ${weakest[1]}` : ""}. ${
      criticals ? `${criticals} critical issue${criticals > 1 ? "s need" : " needs"} fixing first.` : "There are no critical issues."
    } The plan below is ordered by severity.`,
    priorities,
    quickWins,
    strengths: strengths.slice(0, 4),
  };
}
