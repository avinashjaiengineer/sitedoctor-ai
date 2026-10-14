import Link from "next/link";
import { Footer, Header } from "@/components/Chrome";
import { UrlForm } from "@/components/UrlForm";
import { ecgPath } from "@/lib/ecg";

const EXAMPLES = ["wikipedia.org", "bbc.co.uk", "craigslist.org"];

const COVERAGE = [
  {
    title: "Performance",
    items: ["Core Web Vitals on a simulated mid-range phone", "Server response time and redirects", "Compression and render-blocking scripts"],
  },
  {
    title: "Search visibility",
    items: ["Titles, descriptions and headings", "Sitemap, robots.txt and canonical URLs", "Structured data and social sharing tags"],
  },
  {
    title: "Accessibility",
    items: ["Image alt text and link names", "Form labels, colour contrast and language", "Mobile viewport and zoom"],
  },
  {
    title: "Security",
    items: ["HTTPS and mixed content", "HSTS and Content-Security-Policy", "Clickjacking and MIME-sniffing protection"],
  },
];

const STEPS = [
  ["Lighthouse runs on mobile", "Google's PageSpeed Insights loads the page on a throttled phone and scores it in four categories."],
  ["We read the page and its headers", "SiteDoctor fetches the HTML, robots.txt and sitemap to catch issues Lighthouse doesn't report."],
  ["Claude writes the treatment plan", "Every finding is weighed by impact and effort and turned into a short, ordered plan."],
];

export default function Home() {
  const beats = [0.75, 0.8, 0.72, 0.85, 0.78, 0.82, 0.74, 0.88, 0.76, 0.8];
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-12 sm:pt-24">
          <h1 className="max-w-3xl font-display text-5xl leading-[1.02] font-semibold tracking-[-0.03em] text-balance sm:text-7xl">
            Give any website a checkup.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Enter a URL. SiteDoctor tests speed, search visibility, accessibility and security, then writes a treatment plan you can act on today.
          </p>
          <div className="mt-10 max-w-2xl">
            <UrlForm />
            <p className="mt-4 text-sm text-muted">
              Or try{" "}
              {EXAMPLES.map((ex, i) => (
                <span key={ex}>
                  <Link href={`/report?url=${ex}`} className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                    {ex}
                  </Link>
                  {i < EXAMPLES.length - 2 ? ", " : i === EXAMPLES.length - 2 ? " or " : "."}
                </span>
              ))}
            </p>
          </div>
        </section>

        <div className="chart-paper border-y border-grid-strong" aria-hidden>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="block h-28 w-full sm:h-36">
            <path d={ecgPath(beats, 1200, 120)} pathLength={1} className="trace-draw" fill="none" stroke="#172033" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight">What the checkup covers</h2>
          <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {COVERAGE.map((c) => (
              <div key={c.title} className="border-t-2 border-ink pt-4">
                <h3 className="font-display text-xl font-semibold">{c.title}</h3>
                <ul className="mt-3 space-y-2 text-[15px] leading-snug text-muted">
                  {c.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-rule">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight">How it works</h2>
              <p className="mt-3 max-w-sm text-muted">A full checkup takes 20–60 seconds. Reports are kept for six hours so you can share the link.</p>
            </div>
            <ol className="space-y-8">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-4">
                  <span className="font-display text-3xl font-semibold text-grid-strong tabular-nums">{i + 1}</span>
                  <div>
                    <h3 className="font-display text-xl font-semibold">{title}</h3>
                    <p className="mt-1 max-w-xl leading-relaxed text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
