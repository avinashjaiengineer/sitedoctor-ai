"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UrlForm({ initial = "", compact = false }: { initial?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = value.trim();
    if (!url) {
      setError("Enter a website address, like example.com.");
      return;
    }
    setError(null);
    router.push(`/report?url=${encodeURIComponent(url)}`);
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <label htmlFor="url" className="sr-only">
        Website address
      </label>
      <div className={`flex flex-col gap-2 sm:flex-row ${compact ? "" : "sm:gap-3"}`}>
        <input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="yourwebsite.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "url-error" : undefined}
          className={`min-w-0 flex-1 rounded-lg border border-ink/25 bg-white px-4 text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ${
            compact ? "h-11 text-base" : "h-14 text-lg"
          }`}
        />
        <button
          type="submit"
          className={`shrink-0 rounded-lg bg-ink px-6 font-medium text-white transition-colors hover:bg-ink/85 ${compact ? "h-11" : "h-14 text-lg"}`}
        >
          Run checkup
        </button>
      </div>
      {error && (
        <p id="url-error" role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}
    </form>
  );
}
