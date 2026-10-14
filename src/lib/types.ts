export type Category = "performance" | "accessibility" | "best-practices" | "seo";
export type Severity = "critical" | "warning" | "info";
export type Level = "high" | "medium" | "low";

export const CATEGORY_LABELS: Record<Category, string> = {
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best practices",
  seo: "SEO",
};

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  detail: string;
  fix?: string;
  source: "lighthouse" | "inspection";
}

export interface Metric {
  id: string;
  label: string;
  value: string;
  score: number | null;
}

export type Scores = Record<Category, number | null>;

export interface PageFacts {
  title: string | null;
  description: string | null;
  h1s: string[];
  lang: string | null;
  canonical: string | null;
  statusCode: number;
  responseTimeMs: number;
  htmlBytes: number;
  https: boolean;
  redirects: number;
  wordCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  linkCount: number;
  scriptCount: number;
  /** null when the request failed, so presence is unknown. */
  hasRobotsTxt: boolean | null;
  hasSitemap: boolean | null;
  hasStructuredData: boolean;
  server: string | null;
}

export interface Priority {
  title: string;
  category: Category;
  impact: Level;
  effort: Level;
  why: string;
  how: string;
}

export interface Insights {
  verdict: string;
  summary: string;
  priorities: Priority[];
  quickWins: string[];
  strengths: string[];
}

export interface Report {
  version: 1;
  url: string;
  finalUrl: string;
  checkedAt: string;
  overall: number;
  scores: Scores;
  scoreSource: "lighthouse" | "estimated";
  metrics: Metric[];
  findings: Finding[];
  page: PageFacts;
  insights: Insights;
  insightsSource: "ai" | "rules";
  /** Display name of the model that wrote the plan, e.g. "Gemini 2.5 Pro". */
  insightsModel: string | null;
  screenshot: string | null;
  notes: string[];
}

export type StepId = "fetch" | "lighthouse" | "inspect" | "ai";

export type StreamEvent =
  | { type: "step"; step: StepId; status: "start" | "done" }
  | { type: "report"; report: Report; cached: boolean }
  | { type: "error"; message: string };
