"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ecgPath } from "@/lib/ecg";
import type { Report, StepId, StreamEvent } from "@/lib/types";
import { UrlForm } from "./UrlForm";
import { ReportView } from "./ReportView";

const STEPS: { id: StepId; label: string }[] = [
  { id: "fetch", label: "Fetching the page" },
  { id: "inspect", label: "Inspecting HTML, headers and sitemap" },
  { id: "lighthouse", label: "Running Lighthouse on a simulated phone" },
  { id: "ai", label: "Writing the treatment plan" },
];

type StepState = Partial<Record<StepId, "start" | "done">>;
type State =
  | { phase: "running"; steps: StepState }
  | { phase: "done"; report: Report; cached: boolean }
  | { phase: "error"; message: string };

export function ReportClient({ url }: { url: string }) {
  const [state, setState] = useState<State>({ phase: "running", steps: {} });
  const started = useRef(false);

  const run = useCallback(
    async (fresh: boolean) => {
      setState({ phase: "running", steps: {} });
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, fresh }),
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          setState({ phase: "error", message: body.error ?? "The checkup couldn't start. Try again in a minute." });
          return;
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        let finished = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as StreamEvent;
            if (event.type === "step") {
              setState((s) => (s.phase === "running" ? { phase: "running", steps: { ...s.steps, [event.step]: event.status } } : s));
            } else if (event.type === "report") {
              finished = true;
              setState({ phase: "done", report: event.report, cached: event.cached });
            } else {
              finished = true;
              setState({ phase: "error", message: event.message });
            }
          }
        }
        if (!finished) setState({ phase: "error", message: "The checkup stopped before finishing. The site may be too slow to test; try again." });
      } catch {
        setState({ phase: "error", message: "Couldn't reach SiteDoctor. Check your connection and try again." });
      }
    },
    [url],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run(false);
  }, [run]);

  if (state.phase === "done") return <ReportView report={state.report} cached={state.cached} onRerun={() => run(true)} />;

  if (state.phase === "error") {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24">
        <h1 className="font-display text-4xl font-semibold tracking-tight">The checkup didn&apos;t finish</h1>
        <p role="alert" className="mt-4 text-lg text-muted">
          {state.message}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button onClick={() => run(true)} className="h-11 rounded-lg bg-ink px-5 font-medium text-white hover:bg-ink/85">
            Try again
          </button>
        </div>
        <div className="mt-12 border-t border-rule pt-8">
          <p className="mb-3 text-sm text-muted">Or check a different address</p>
          <UrlForm compact initial={url} />
        </div>
      </div>
    );
  }

  return <Progress url={url} steps={state.steps} />;
}

function Progress({ url, steps }: { url: string; steps: StepState }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-20" aria-live="polite" aria-busy="true">
      <p className="text-muted">Checking</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight break-all sm:text-5xl">{url.replace(/^https?:\/\//, "")}</h1>

      <div className="chart-paper mt-10 overflow-hidden rounded-lg border border-grid-strong" aria-hidden>
        <svg viewBox="0 0 800 100" preserveAspectRatio="none" className="block h-24 w-full">
          <path d={ecgPath([0.7, 0.75, 0.7, 0.8, 0.72, 0.76], 800, 100)} pathLength={1} className="trace-sweep" fill="none" stroke="#172033" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <ol className="mt-10 space-y-4">
        {STEPS.map((step) => {
          const status = steps[step.id];
          return (
            <li key={step.id} className="flex items-center gap-4">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                  status === "done" ? "border-healthy bg-healthy text-white" : status === "start" ? "border-ink" : "border-rule"
                }`}
              >
                {status === "done" ? (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : status === "start" ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-ink motion-reduce:animate-none" />
                ) : null}
              </span>
              <span className={status ? "text-ink" : "text-muted"}>
                {step.label}
                <span className="sr-only">{status === "done" ? " (done)" : status === "start" ? " (in progress)" : " (waiting)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-10 text-sm text-muted">Lighthouse usually takes 15–40 seconds. Keep this tab open.</p>
    </div>
  );
}
