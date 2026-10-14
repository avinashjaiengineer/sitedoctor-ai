"use client";

import { useMemo, useState } from "react";
import { ecgPath, TONE_TEXT, toneFor, type Tone } from "@/lib/ecg";
import { CATEGORY_LABELS, type Category, type Finding, type Level, type Report, type Severity } from "@/lib/types";

const CATEGORIES: Category[] = ["performance", "accessibility", "best-practices", "seo"];

const TONE_CLASSES: Record<Tone, { text: string; bg: string; stroke: string }> = {
  healthy: { text: "text-healthy", bg: "bg-tint-healthy", stroke: "#157f55" },
  watch: { text: "text-watch", bg: "bg-tint-watch", stroke: "#a86a12" },
  critical: { text: "text-critical", bg: "bg-tint-critical", stroke: "#c2362b" },
};

const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  critical: { label: "Critical", tone: "critical" },
  warning: { label: "Warning", tone: "watch" },
  info: { label: "Advisory", tone: "healthy" },
};
const SEVERITY_ORDER: Severity[] = ["critical", "warning", "info"];

export function ReportView({ report, cached, onRerun }: { report: Report; cached: boolean; onRerun: () => void }) {
  const host = new URL(report.finalUrl).hostname.replace(/^www\./, "");
  const tone = toneFor(report.overall);

  return (
    <article className="mx-auto max-w-6xl px-5 pb-24">
      <PatientHeader report={report} host={host} cached={cached} onRerun={onRerun} />

      <section className="grid gap-10 border-b border-rule py-12 lg:grid-cols-[1fr_auto]" aria-labelledby="diagnosis">
        <div className="max-w-3xl">
          <h2 id="diagnosis" className="text-sm font-medium text-muted">
            Diagnosis
          </h2>
          <p className="mt-3 font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">{report.insights.verdict}</p>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{report.insights.summary}</p>
          {report.notes.map((note) => (
            <p key={note} className="mt-4 max-w-2xl rounded-md border border-watch/30 bg-tint-watch px-4 py-3 text-sm text-ink">
              {note}
            </p>
          ))}
        </div>
        <div className="flex items-start gap-8">
          <div className="text-center">
            <ScoreRing score={report.overall} size={168} />
            <p className={`mt-2 font-medium ${TONE_CLASSES[tone].text}`}>{TONE_TEXT[tone]}</p>
            <p className="text-sm text-muted">Overall health</p>
          </div>
          {report.screenshot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={report.screenshot} alt={`Mobile screenshot of ${host}`} className="hidden h-60 w-auto rounded-xl border-4 border-ink shadow-[0_1px_0_#172033] sm:block" />
          )}
        </div>
      </section>

      <VitalsStrip report={report} />
      {report.metrics.length > 0 && <CoreWebVitals report={report} />}
      <TreatmentPlan report={report} />
      <Findings findings={report.findings} />
      <PageFacts report={report} />
    </article>
  );
}

function PatientHeader({ report, host, cached, onRerun }: { report: Report; host: string; cached: boolean; onRerun: () => void }) {
  const [copied, setCopied] = useState(false);
  const checked = new Date(report.checkedAt);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <header className="flex flex-col gap-6 border-b border-rule pt-12 pb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="text-muted">Health report for</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.03em] break-words sm:text-6xl">{host}</h1>
        <p className="mt-3 text-sm text-muted">
          <a href={report.finalUrl} target="_blank" rel="noreferrer" className="underline decoration-ink/25 underline-offset-4 hover:text-ink">
            {report.finalUrl}
          </a>
          <span className="mx-2" aria-hidden>
            /
          </span>
          Checked {checked.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          {cached && " (saved report)"}
        </p>
      </div>
      <div className="no-print flex shrink-0 flex-wrap gap-2">
        <button onClick={copyLink} className="h-10 rounded-lg border border-ink/20 bg-white px-4 text-sm font-medium hover:border-ink">
          <span aria-live="polite">{copied ? "Link copied" : "Copy share link"}</span>
        </button>
        <button onClick={() => window.print()} className="h-10 rounded-lg border border-ink/20 bg-white px-4 text-sm font-medium hover:border-ink">
          Save as PDF
        </button>
        <button onClick={onRerun} className="h-10 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-ink/85">
          Run again
        </button>
      </div>
    </header>
  );
}

function ScoreRing({ score, size }: { score: number | null; size: number }) {
  const tone = toneFor(score);
  const r = 44;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={score == null ? "No score" : `${score} out of 100`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e9e1de" strokeWidth="6" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={TONE_CLASSES[tone].stroke}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="fill-ink font-display" fontSize="30" fontWeight="600">
        {score ?? "–"}
      </text>
    </svg>
  );
}

/** The signature element: one ECG lane per category, where beat height and colour follow the score. */
function VitalsStrip({ report }: { report: Report }) {
  return (
    <section className="py-12" aria-labelledby="vitals">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="vitals" className="font-display text-2xl font-semibold tracking-tight">
          Vitals
        </h2>
        <p className="text-sm text-muted">
          {report.scoreSource === "lighthouse" ? "Google Lighthouse, mobile, 0–100" : "Estimated from SiteDoctor's inspection, 0–100"}
        </p>
      </div>
      <div className="chart-paper mt-5 grid overflow-hidden rounded-lg border border-grid-strong sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((cat, i) => {
          const score = report.scores[cat];
          const tone = toneFor(score);
          const amp = score == null ? 0.1 : score / 100;
          const beats = [amp, amp * (score != null && score < 50 ? 0.55 : 0.95), amp];
          return (
            <div key={cat} className="border-b border-grid-strong px-5 pt-5 pb-2 last:border-b-0 sm:odd:border-r sm:[&:nth-child(n+3)]:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-medium">{CATEGORY_LABELS[cat]}</h3>
                <span className={`text-sm font-medium ${TONE_CLASSES[tone].text}`}>{score == null ? "Not measured" : TONE_TEXT[tone]}</span>
              </div>
              <p className={`font-display text-6xl font-semibold tracking-tight tabular-nums ${TONE_CLASSES[tone].text}`}>{score ?? "–"}</p>
              <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="mt-1 block h-16 w-full" aria-hidden>
                <path d={ecgPath(beats, 300, 80)} pathLength={1} className="trace-draw" style={{ animationDelay: `${i * 0.25}s` }} fill="none" stroke={TONE_CLASSES[tone].stroke} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CoreWebVitals({ report }: { report: Report }) {
  return (
    <section className="border-t border-rule py-12" aria-labelledby="cwv">
      <h2 id="cwv" className="font-display text-2xl font-semibold tracking-tight">
        Loading measurements
      </h2>
      <p className="mt-1 text-sm text-muted">Lab data from a simulated mid-range phone on a slow 4G connection.</p>
      <dl className="mt-6 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
        {report.metrics.map((m) => {
          const tone = toneFor(m.score == null ? null : Math.round(m.score * 100));
          return (
            <div key={m.id} className="flex items-baseline justify-between gap-4 border-b border-rule py-3">
              <dt className="flex items-center gap-2.5 text-muted">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone === "healthy" ? "bg-healthy" : tone === "watch" ? "bg-watch" : "bg-critical"}`} aria-hidden />
                {m.label}
              </dt>
              <dd className={`font-display text-xl font-semibold tabular-nums ${TONE_CLASSES[tone].text}`}>
                {m.value}
                <span className="sr-only"> ({TONE_TEXT[tone]})</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

const LEVEL_TEXT: Record<Level, string> = { high: "High", medium: "Medium", low: "Low" };

function TreatmentPlan({ report }: { report: Report }) {
  const { priorities, quickWins, strengths } = report.insights;
  const [done, setDone] = useState<Set<number>>(new Set());

  return (
    <section className="border-t border-rule py-12" aria-labelledby="plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plan" className="font-display text-2xl font-semibold tracking-tight">
          Treatment plan
        </h2>
        <p className="text-sm text-muted">{report.insightsSource === "ai" ? `Written by ${report.insightsModel ?? "AI"} from this report's findings` : "Ordered by severity"}</p>
      </div>

      <ol className="mt-6 divide-y divide-rule border-y border-rule">
        {priorities.map((p, i) => (
          <li key={p.title} className="grid gap-x-6 gap-y-3 py-6 md:grid-cols-[3rem_1fr_13rem]">
            <span className="font-display text-4xl leading-none font-semibold text-grid-strong tabular-nums">{i + 1}</span>
            <div className="max-w-2xl">
              <h3 className="font-display text-xl font-semibold">{p.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{p.why}</p>
              <p className="mt-3 leading-relaxed">{p.how}</p>
            </div>
            <dl className="flex gap-6 text-sm md:flex-col md:gap-2">
              <div>
                <dt className="inline text-muted">Area: </dt>
                <dd className="inline font-medium">{CATEGORY_LABELS[p.category]}</dd>
              </div>
              <div>
                <dt className="inline text-muted">Impact: </dt>
                <dd className={`inline font-medium ${p.impact === "high" ? "text-critical" : p.impact === "medium" ? "text-watch" : ""}`}>{LEVEL_TEXT[p.impact]}</dd>
              </div>
              <div>
                <dt className="inline text-muted">Effort: </dt>
                <dd className="inline font-medium">{LEVEL_TEXT[p.effort]}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        {quickWins.length > 0 && (
          <div>
            <h3 className="font-display text-xl font-semibold">Quick wins</h3>
            <p className="mt-1 text-sm text-muted">Each takes under an hour. Tick them off as you go.</p>
            <ul className="mt-4 space-y-1">
              {quickWins.map((win, i) => (
                <li key={win}>
                  <label className="flex cursor-pointer gap-3 rounded-md px-2 py-2 hover:bg-tint-healthy/60">
                    <input
                      type="checkbox"
                      checked={done.has(i)}
                      onChange={() => setDone((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set(s).add(i)))}
                      className="mt-1 h-4 w-4 shrink-0 accent-healthy"
                    />
                    <span className={done.has(i) ? "text-muted line-through" : ""}>{win}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {strengths.length > 0 && (
          <div>
            <h3 className="font-display text-xl font-semibold">Already working well</h3>
            <ul className="mt-4 space-y-3">
              {strengths.map((s) => (
                <li key={s} className="flex gap-3">
                  <svg viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0 text-healthy" aria-hidden>
                    <path d="M3 8.5l3 3 7-7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Findings({ findings }: { findings: Finding[] }) {
  const [filter, setFilter] = useState<Category | "all">("all");
  const counts = useMemo(() => {
    const c = { all: findings.length } as Record<Category | "all", number>;
    for (const cat of CATEGORIES) c[cat] = findings.filter((f) => f.category === cat).length;
    return c;
  }, [findings]);
  const visible = findings
    .filter((f) => filter === "all" || f.category === filter)
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return (
    <section className="border-t border-rule py-12" aria-labelledby="findings">
      <h2 id="findings" className="font-display text-2xl font-semibold tracking-tight">
        All findings
      </h2>
      <p className="mt-1 text-sm text-muted">
        {SEVERITY_ORDER.map((s) => `${findings.filter((f) => f.severity === s).length} ${SEVERITY[s].label.toLowerCase()}`).join(", ")}
      </p>

      <div className="no-print mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter findings by area">
        {(["all", ...CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            aria-pressed={filter === cat}
            onClick={() => setFilter(cat)}
            className={`h-9 rounded-full border px-4 text-sm font-medium ${filter === cat ? "border-ink bg-ink text-white" : "border-ink/20 bg-white hover:border-ink"}`}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat]} <span className="opacity-60 tabular-nums">{counts[cat]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-muted">No issues found in this area.</p>
      ) : (
        <ul className="mt-6 border-t border-rule">
          {visible.map((f) => {
            const sev = SEVERITY[f.severity];
            return (
              <li key={f.id} className="border-b border-rule">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-4 py-4 [&::-webkit-details-marker]:hidden">
                    <span className={`mt-0.5 w-20 shrink-0 rounded px-2 py-0.5 text-center text-xs font-medium ${TONE_CLASSES[sev.tone].bg} ${TONE_CLASSES[sev.tone].text}`}>{sev.label}</span>
                    <span className="flex-1 font-medium">{f.title}</span>
                    <span className="hidden shrink-0 text-sm text-muted sm:block">{CATEGORY_LABELS[f.category]}</span>
                    <svg viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden>
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </summary>
                  <div className="max-w-3xl pb-5 pl-0 text-[15px] leading-relaxed sm:pl-24">
                    <p className="text-muted">{f.detail}</p>
                    {f.fix && (
                      <p className="mt-2">
                        <span className="font-medium">Fix: </span>
                        {f.fix}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">Source: {f.source === "lighthouse" ? "Google Lighthouse audit" : "SiteDoctor inspection"}</p>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PageFacts({ report }: { report: Report }) {
  const p = report.page;
  const yes = (v: boolean | null) => (v == null ? "Couldn't check" : v ? "Yes" : "No");
  const facts: [string, string][] = [
    ["Title", p.title ?? "Missing"],
    ["Meta description", p.description ?? "Missing"],
    ["Main heading", p.h1s[0] ?? "Missing"],
    ["HTTP status", String(p.statusCode)],
    ["Server response", `${p.responseTimeMs} ms`],
    ["HTML size", `${Math.round(p.htmlBytes / 1024)} KB`],
    ["Redirects", String(p.redirects)],
    ["Language", p.lang ?? "Not declared"],
    ["Words on page", p.wordCount.toLocaleString()],
    ["Images", `${p.imageCount} (${p.imagesMissingAlt} without alt text)`],
    ["Links", p.linkCount.toLocaleString()],
    ["External scripts", String(p.scriptCount)],
    ["HTTPS", yes(p.https)],
    ["robots.txt", yes(p.hasRobotsTxt)],
    ["XML sitemap", yes(p.hasSitemap)],
    ["Structured data", yes(p.hasStructuredData)],
  ];
  return (
    <section className="border-t border-rule py-12" aria-labelledby="facts">
      <h2 id="facts" className="font-display text-2xl font-semibold tracking-tight">
        Page record
      </h2>
      <dl className="mt-6 grid gap-x-10 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[10rem_1fr] gap-4 border-b border-rule py-3 text-[15px]">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
