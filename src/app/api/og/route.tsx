import { ImageResponse } from "next/og";
import { ecgPath, toneFor } from "@/lib/ecg";
import { getReport } from "@/lib/store";
import { normalizeUrl, reportKey } from "@/lib/url";

const TONE_HEX = { healthy: "#157f55", watch: "#a86a12", critical: "#c2362b" } as const;

/** Share card for a report link. Shows the score if a saved report exists, otherwise a generic card. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let host = "any website";
  let score: number | null = null;
  try {
    const url = normalizeUrl(raw);
    host = url.hostname.replace(/^www\./, "");
    score = (await getReport(reportKey(url)))?.overall ?? null;
  } catch {
    // Fall through to the generic card.
  }
  const color = score == null ? "#172033" : TONE_HEX[toneFor(score)];
  const trace = ecgPath([0.7, 0.8, 0.72, 0.85, 0.76], 1200, 160);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fffcfb", color: "#172033", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flex: 1, padding: "64px 72px", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
            <div style={{ fontSize: 30, color: "#5b6474" }}>SiteDoctor AI health report</div>
            <div style={{ fontSize: host.length > 22 ? 64 : 88, fontWeight: 700, letterSpacing: -3, marginTop: 16, lineHeight: 1 }}>{host}</div>
          </div>
          {score != null && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 200, height: 200, borderRadius: 100, border: `14px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 84, fontWeight: 700, color }}>
                {score}
              </div>
              <div style={{ fontSize: 26, color: "#5b6474", marginTop: 12 }}>Overall health</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", height: 180, background: "#fff8f6", borderTop: "2px solid #eab3a8" }}>
          <svg width="1200" height="160" viewBox="0 0 1200 160" style={{ marginTop: 10 }}>
            <path d={trace} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
