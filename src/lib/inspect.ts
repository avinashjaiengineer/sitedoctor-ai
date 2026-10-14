import * as cheerio from "cheerio";
import { assertPublicHost, InputError } from "./url";
import type { Finding, PageFacts } from "./types";

const USER_AGENT = "Mozilla/5.0 (compatible; SiteDoctorAI/1.0; +https://github.com/)";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface FetchResult {
  finalUrl: URL;
  status: number;
  headers: Headers;
  body: string;
  bytes: number;
  timeMs: number;
  redirects: number;
}

async function readLimited(res: Response, limit: number): Promise<{ text: string; bytes: number }> {
  if (!res.body) return { text: "", bytes: 0 };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks)), bytes };
}

/** fetch() that follows redirects manually so every hop passes the private-network check. */
async function safeFetch(start: URL, timeoutMs: number, maxBytes = MAX_HTML_BYTES): Promise<FetchResult> {
  let url = start;
  const began = performance.now();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url.hostname);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = new URL(location, url);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new InputError("The site redirected to an unsupported address.");
      continue;
    }
    const timeMs = Math.round(performance.now() - began);
    const { text, bytes } = await readLimited(res, maxBytes);
    return { finalUrl: url, status: res.status, headers: res.headers, body: text, bytes, timeMs, redirects: hop };
  }
  throw new InputError("The site redirected too many times.");
}

/** true/false when the server answered; null when the request failed or timed out, so absence isn't claimed. */
async function exists(url: URL, test: (body: string) => boolean): Promise<boolean | null> {
  try {
    const res = await safeFetch(url, 6000, 512 * 1024);
    return res.status === 200 && test(res.body);
  } catch {
    return null;
  }
}

export async function fetchPage(url: URL): Promise<FetchResult> {
  try {
    return await safeFetch(url, 15000);
  } catch (err) {
    if (err instanceof InputError) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new InputError(`${url.hostname} took longer than 15 seconds to respond.`);
    }
    throw new InputError(`We couldn't connect to ${url.hostname}. The site may be down or blocking automated checks.`);
  }
}

export async function inspectPage(page: FetchResult): Promise<{ facts: PageFacts; findings: Finding[] }> {
  const $ = cheerio.load(page.body);
  const base = page.finalUrl;
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "source">) => findings.push({ ...f, source: "inspection" });

  const robotsTxtUrl = new URL("/robots.txt", base);
  const [robotsTxt, sitemapDefault] = await Promise.all([
    safeFetch(robotsTxtUrl, 6000, 256 * 1024).catch(() => null),
    exists(new URL("/sitemap.xml", base), (b) => /<(urlset|sitemapindex)/i.test(b)),
  ]);
  const hasRobotsTxt = robotsTxt ? robotsTxt.status === 200 && !/<html/i.test(robotsTxt.body) : null;
  const sitemapInRobots = hasRobotsTxt === true && /^\s*sitemap:/im.test(robotsTxt!.body);
  const hasSitemap = sitemapDefault === true || sitemapInRobots ? true : sitemapDefault === null || hasRobotsTxt === null ? null : false;

  const title = $("head title").first().text().trim() || null;
  const description = $('meta[name="description" i]').attr("content")?.trim() || null;
  const h1s = $("h1").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get().filter(Boolean);
  const lang = $("html").attr("lang")?.trim() || null;
  const canonical = $('link[rel="canonical" i]').attr("href") || null;
  const viewport = $('meta[name="viewport" i]').attr("content");
  const robotsMeta = $('meta[name="robots" i]').attr("content")?.toLowerCase() ?? "";
  const images = $("img");
  const imagesMissingAlt = images.filter((_, el) => $(el).attr("alt") === undefined).length;
  const imagesNoDimensions = images.filter((_, el) => !$(el).attr("width") || !$(el).attr("height")).length;
  const structuredData = $('script[type="application/ld+json"]').length > 0 || $("[itemscope]").length > 0;
  const bodyText = $("body").clone().find("script,style,noscript,svg").remove().end().text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;
  const https = base.protocol === "https:";

  // Response basics
  if (page.status >= 400) {
    add({ id: "http-status", category: "seo", severity: "critical", title: `Page returns HTTP ${page.status}`, detail: "Search engines and visitors receive an error instead of the page.", fix: "Make sure the URL serves the page with a 200 status code." });
  }
  if (!https) {
    add({ id: "no-https", category: "best-practices", severity: "critical", title: "Page is served without HTTPS", detail: "Browsers mark the site as 'Not secure' and data travels unencrypted.", fix: "Install a TLS certificate (free via Let's Encrypt or your host) and redirect all HTTP traffic to HTTPS." });
  }
  if (page.redirects >= 2) {
    add({ id: "redirect-chain", category: "performance", severity: "warning", title: `${plural(page.redirects, "redirect", "redirects")} before the page loads`, detail: "Each redirect adds a full network round trip before anything renders.", fix: "Link directly to the final URL and collapse redirect chains into a single hop." });
  }
  if (page.timeMs > 1800) {
    add({ id: "slow-response", category: "performance", severity: "critical", title: `Server took ${(page.timeMs / 1000).toFixed(1)}s to deliver the HTML`, detail: "A slow server response delays every other metric.", fix: "Add page caching or a CDN, and look for slow database queries or server-side rendering work." });
  } else if (page.timeMs > 800) {
    add({ id: "slow-response", category: "performance", severity: "warning", title: `Server took ${page.timeMs} ms to deliver the HTML`, detail: "Google recommends a server response under 800 ms.", fix: "Cache rendered pages or serve them from a CDN edge." });
  }
  if (page.bytes > 500 * 1024) {
    add({ id: "large-html", category: "performance", severity: "warning", title: `HTML document is ${Math.round(page.bytes / 1024)} KB`, detail: "Large documents take longer to download and parse, especially on mobile.", fix: "Remove inlined data and unused markup; paginate or lazy-load long lists." });
  }
  if (!page.headers.get("content-encoding") && page.bytes > 20 * 1024) {
    add({ id: "no-compression", category: "performance", severity: "warning", title: "HTML isn't compressed", detail: "Text responses can usually shrink by 70% or more with gzip or Brotli.", fix: "Enable Brotli or gzip compression on your server or CDN." });
  }
  const blockingScripts = $("head script[src]").filter((_, el) => $(el).attr("async") === undefined && $(el).attr("defer") === undefined && $(el).attr("type") !== "module").length;
  if (blockingScripts >= 3) {
    add({ id: "blocking-scripts", category: "performance", severity: "warning", title: `${plural(blockingScripts, "render-blocking script", "render-blocking scripts")} in <head>`, detail: "The browser must download and run these before showing anything.", fix: "Add defer or async to scripts that don't need to run before first paint." });
  }

  // SEO
  if (!title) {
    add({ id: "title-missing", category: "seo", severity: "critical", title: "Page has no <title>", detail: "The title is the headline shown in search results and browser tabs.", fix: "Add a unique, descriptive title of 30–60 characters." });
  } else if (title.length < 15 || title.length > 65) {
    add({ id: "title-length", category: "seo", severity: "warning", title: `Title is ${title.length} characters`, detail: `“${title.slice(0, 80)}” — search engines show about 50–60 characters.`, fix: "Rewrite the title to 30–60 characters, leading with the main keyword." });
  }
  if (!description) {
    add({ id: "description-missing", category: "seo", severity: "warning", title: "No meta description", detail: "Search engines will pick a random snippet from the page instead.", fix: "Add a 120–160 character meta description that summarises the page and invites the click." });
  } else if (description.length < 50 || description.length > 170) {
    add({ id: "description-length", category: "seo", severity: "info", title: `Meta description is ${description.length} characters`, detail: "Descriptions between 120 and 160 characters display best in results.", fix: "Adjust the description to roughly 120–160 characters." });
  }
  if (h1s.length === 0) {
    add({ id: "h1-missing", category: "seo", severity: "warning", title: "No <h1> heading", detail: "The main heading tells readers and search engines what the page is about.", fix: "Add one <h1> that states the page's topic." });
  } else if (h1s.length > 1) {
    add({ id: "h1-multiple", category: "seo", severity: "info", title: `${h1s.length} <h1> headings`, detail: "Multiple top-level headings dilute the page's main topic.", fix: "Keep one <h1> and demote the others to <h2>." });
  }
  if (!canonical) {
    add({ id: "canonical-missing", category: "seo", severity: "info", title: "No canonical URL", detail: "Without it, duplicate URLs (tracking parameters, trailing slashes) can split ranking signals.", fix: 'Add <link rel="canonical" href="…"> pointing to the preferred URL.' });
  }
  if (/noindex/.test(robotsMeta)) {
    add({ id: "noindex", category: "seo", severity: "critical", title: "Page tells search engines not to index it", detail: `The robots meta tag contains “${robotsMeta}”.`, fix: "Remove noindex if this page should appear in search results." });
  }
  if (hasSitemap === false) {
    add({ id: "sitemap-missing", category: "seo", severity: "warning", title: "No XML sitemap found", detail: "No sitemap at /sitemap.xml and none listed in robots.txt.", fix: "Generate a sitemap, reference it in robots.txt, and submit it in Google Search Console." });
  }
  if (hasRobotsTxt === false) {
    add({ id: "robots-missing", category: "seo", severity: "info", title: "No robots.txt", detail: "Crawlers look for /robots.txt first to learn the site's rules.", fix: "Add a robots.txt that allows crawling and lists your sitemap." });
  }
  if (!structuredData) {
    add({ id: "structured-data", category: "seo", severity: "info", title: "No structured data", detail: "Schema.org markup makes pages eligible for rich results such as ratings, FAQs and breadcrumbs.", fix: "Add JSON-LD for your organisation and key page types." });
  }
  const ogMissing = ["og:title", "og:description", "og:image"].filter((p) => !$(`meta[property="${p}"]`).attr("content"));
  if (ogMissing.length) {
    add({ id: "open-graph", category: "seo", severity: "info", title: "Incomplete social sharing tags", detail: `Missing ${ogMissing.join(", ")} — links shared on social media will look plain.`, fix: "Add Open Graph title, description and a 1200×630 image." });
  }
  if (wordCount > 0 && wordCount < 250) {
    add({ id: "thin-content", category: "seo", severity: "info", title: `Only about ${wordCount} words of visible text`, detail: "Pages with little text give search engines less to rank. Sites that render text with JavaScript may show a low count here.", fix: "Expand the page with useful, specific copy, or server-render existing content." });
  }

  // Accessibility & mobile
  if (!viewport) {
    add({ id: "viewport", category: "accessibility", severity: "critical", title: "No mobile viewport tag", detail: "Phones will render the desktop layout zoomed out.", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' });
  } else if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(viewport)) {
    add({ id: "zoom-disabled", category: "accessibility", severity: "warning", title: "Pinch-zoom is disabled", detail: "People with low vision rely on zooming.", fix: "Remove user-scalable=no and maximum-scale from the viewport tag." });
  }
  if (!lang) {
    add({ id: "lang-missing", category: "accessibility", severity: "warning", title: "Page language isn't declared", detail: "Screen readers use it to choose pronunciation.", fix: 'Add a lang attribute, e.g. <html lang="en">.' });
  }
  if (imagesMissingAlt > 0) {
    add({ id: "img-alt", category: "accessibility", severity: imagesMissingAlt > 5 ? "critical" : "warning", title: `${imagesMissingAlt} of ${plural(images.length, "image", "images")} ${imagesMissingAlt === 1 ? "has" : "have"} no alt text`, detail: "Screen-reader users hear nothing (or the file name) for these images.", fix: 'Describe meaningful images in alt; use alt="" for decorative ones.' });
  }
  if (imagesNoDimensions > 3) {
    add({ id: "img-dimensions", category: "performance", severity: "info", title: `${plural(imagesNoDimensions, "image", "images")} without width and height`, detail: "The layout jumps as they load, hurting Cumulative Layout Shift.", fix: "Set width and height attributes (or CSS aspect-ratio) on images." });
  }
  const emptyLinks = $("a[href]").filter((_, el) => !$(el).text().trim() && !$(el).attr("aria-label") && !$(el).attr("title") && !$(el).find("img[alt]:not([alt=''])").length).length;
  if (emptyLinks > 0) {
    add({ id: "empty-links", category: "accessibility", severity: "warning", title: `${plural(emptyLinks, "link has", "links have")} no accessible name`, detail: "Screen readers announce these as just “link”.", fix: "Add visible text or an aria-label to icon-only links." });
  }
  const unlabeled = $("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea").filter((_, el) => {
    const id = $(el).attr("id");
    return !$(el).attr("aria-label") && !$(el).attr("aria-labelledby") && !$(el).closest("label").length && !(id && $(`label[for="${id}"]`).length);
  }).length;
  if (unlabeled > 0) {
    add({ id: "unlabeled-inputs", category: "accessibility", severity: "warning", title: `${plural(unlabeled, "form field has", "form fields have")} no label`, detail: "Placeholder text isn't a substitute: it disappears and isn't reliably announced.", fix: "Associate each field with a <label for> or aria-label." });
  }

  // Security headers
  const h = page.headers;
  if (https && !h.get("strict-transport-security")) {
    add({ id: "hsts", category: "best-practices", severity: "warning", title: "No Strict-Transport-Security header", detail: "Browsers may still try plain HTTP first, allowing downgrade attacks.", fix: "Send Strict-Transport-Security: max-age=31536000; includeSubDomains." });
  }
  if (!h.get("content-security-policy")) {
    add({ id: "csp", category: "best-practices", severity: "info", title: "No Content-Security-Policy", detail: "A CSP limits the damage of injected scripts (XSS).", fix: "Start with a report-only CSP, then enforce it once violations are understood." });
  }
  if (!h.get("x-content-type-options")) {
    add({ id: "nosniff", category: "best-practices", severity: "info", title: "No X-Content-Type-Options header", detail: "Browsers may guess file types, which can be abused.", fix: "Send X-Content-Type-Options: nosniff." });
  }
  if (!h.get("x-frame-options") && !/frame-ancestors/i.test(h.get("content-security-policy") ?? "")) {
    add({ id: "clickjacking", category: "best-practices", severity: "info", title: "Page can be embedded by any site", detail: "Without frame protection the page is open to clickjacking.", fix: "Send X-Frame-Options: SAMEORIGIN or a CSP frame-ancestors directive." });
  }
  if (https) {
    const mixed = $('img[src^="http:"], script[src^="http:"], link[rel=stylesheet][href^="http:"], iframe[src^="http:"]').length;
    if (mixed > 0) {
      add({ id: "mixed-content", category: "best-practices", severity: "warning", title: `${plural(mixed, "resource loads", "resources load")} over insecure HTTP`, detail: "Browsers block or warn about mixed content on HTTPS pages.", fix: "Switch these resource URLs to https://." });
    }
  }

  const facts: PageFacts = {
    title,
    description,
    h1s: h1s.slice(0, 5),
    lang,
    canonical,
    statusCode: page.status,
    responseTimeMs: page.timeMs,
    htmlBytes: page.bytes,
    https,
    redirects: page.redirects,
    wordCount,
    imageCount: images.length,
    imagesMissingAlt,
    linkCount: $("a[href]").length,
    scriptCount: $("script[src]").length,
    hasRobotsTxt,
    hasSitemap,
    hasStructuredData: structuredData,
    server: h.get("server"),
  };
  return { facts, findings };
}

/** Inspection IDs that duplicate Lighthouse audits; ours carry counts and fixes, so Lighthouse's copy is dropped. */
export const INSPECTION_COVERS = new Set([
  "document-title",
  "meta-description",
  "image-alt",
  "html-has-lang",
  "viewport",
  "is-crawlable",
  "canonical",
  "link-name",
  "is-on-https",
  "redirects",
  "server-response-time",
  "uses-text-compression",
  "unsized-images",
  "label",
]);
