import Link from "next/link";

function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className="h-7 w-7">
      <rect x="1" y="1" width="30" height="30" rx="7" className="fill-ink" />
      <path d="M5 18h6l2-7 4 13 3-9 1.5 3H27" fill="none" stroke="#fff8f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="no-print border-b border-rule">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
          <Mark />
          SiteDoctor AI
        </Link>
        {children}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="no-print mt-auto border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted sm:flex-row sm:justify-between">
        <p>Scores from Google Lighthouse. Treatment plans written by AI.</p>
        <p className="flex gap-5">
          {process.env.NEXT_PUBLIC_AUTHOR_NAME && (
            <span>
              Built by{" "}
              {process.env.NEXT_PUBLIC_AUTHOR_URL ? (
                <a className="underline underline-offset-4 hover:text-ink" href={process.env.NEXT_PUBLIC_AUTHOR_URL}>
                  {process.env.NEXT_PUBLIC_AUTHOR_NAME}
                </a>
              ) : (
                process.env.NEXT_PUBLIC_AUTHOR_NAME
              )}
            </span>
          )}
          {process.env.NEXT_PUBLIC_REPO_URL && (
            <a className="underline underline-offset-4 hover:text-ink" href={process.env.NEXT_PUBLIC_REPO_URL}>
              Source code
            </a>
          )}
        </p>
      </div>
    </footer>
  );
}
