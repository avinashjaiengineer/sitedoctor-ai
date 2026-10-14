import type { Metadata } from "next";
import { Suspense } from "react";
import { Footer, Header } from "@/components/Chrome";
import { ReportClient } from "@/components/ReportClient";
import { UrlForm } from "@/components/UrlForm";

function hostOf(raw: string): string {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

export async function generateMetadata({ searchParams }: PageProps<"/report">): Promise<Metadata> {
  const { url } = await searchParams;
  if (typeof url !== "string" || !url) return { title: "Report" };
  const host = hostOf(url);
  const og = `/api/og?url=${encodeURIComponent(url)}`;
  return {
    title: `Checkup for ${host}`,
    description: `Website health report for ${host}: performance, SEO, accessibility and security, with an AI treatment plan.`,
    openGraph: { images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { images: [og] },
  };
}

export default function ReportPage({ searchParams }: PageProps<"/report">) {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Suspense>
          <ReportBody searchParams={searchParams} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function ReportBody({ searchParams }: Pick<PageProps<"/report">, "searchParams">) {
  const { url } = await searchParams;
  const target = typeof url === "string" ? url.trim() : "";

  if (!target) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Which site should we check?</h1>
        <p className="mt-3 text-muted">Enter an address to start a checkup.</p>
        <div className="mt-8">
          <UrlForm />
        </div>
      </div>
    );
  }
  return <ReportClient url={target} key={target} />;
}
