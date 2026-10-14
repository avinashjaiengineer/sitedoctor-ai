import { analyze } from "@/lib/analyze";
import { allowRequest, getReport, saveReport } from "@/lib/store";
import { InputError, normalizeUrl, reportKey } from "@/lib/url";
import type { StreamEvent } from "@/lib/types";

export const maxDuration = 120;

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

/**
 * POST { url, fresh? } → NDJSON stream of StreamEvents: step progress, then a single report or error.
 */
export async function POST(req: Request) {
  let body: { url?: unknown; fresh?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Send a JSON body with a url field." });
  }

  let url: URL;
  try {
    url = normalizeUrl(typeof body.url === "string" ? body.url : "");
  } catch (err) {
    return json(400, { error: err instanceof InputError ? err.message : "Invalid URL." });
  }

  const key = reportKey(url);
  const encoder = new TextEncoder();

  const cached = body.fresh ? null : await getReport(key);
  if (cached) {
    const event: StreamEvent = { type: "report", report: cached, cached: true };
    return new Response(JSON.stringify(event) + "\n", { headers: { "content-type": "application/x-ndjson" } });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  if (!(await allowRequest(ip))) {
    return json(429, { error: "You've run a lot of checkups in a short time. Wait a few minutes and try again." });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const report = await analyze(url, (step, status) => send({ type: "step", step, status }));
        await saveReport(key, report);
        send({ type: "report", report, cached: false });
      } catch (err) {
        console.error("[analyze]", err);
        send({ type: "error", message: err instanceof InputError ? err.message : "Something went wrong while checking this site. Try again in a minute." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
