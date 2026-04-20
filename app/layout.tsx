import type { Metadata } from "next";
import Link from "next/link";
import { Factory as FactoryIcon, Github } from "lucide-react";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s — ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface text-gray-100 antialiased">
        <header className="sticky top-0 z-40 border-b border-surface-border bg-surface/80 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-[1800px] items-center gap-4 px-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/15 text-brand">
                <FactoryIcon className="h-3.5 w-3.5" />
              </span>
              <span>{APP_NAME}</span>
              <span className="hidden text-xs font-normal text-gray-500 sm:inline">
                {APP_TAGLINE}
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm text-gray-400">
              <Link
                href="/"
                className="rounded px-2 py-1 hover:bg-surface-raised hover:text-gray-100"
              >
                Planner
              </Link>
              <Link
                href="/recipes"
                className="rounded px-2 py-1 hover:bg-surface-raised hover:text-gray-100"
              >
                Recipes
              </Link>
              <Link
                href="/buildings"
                className="rounded px-2 py-1 hover:bg-surface-raised hover:text-gray-100"
              >
                Buildings
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <a
                href="https://github.com/"
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1.5 rounded-md border border-surface-border px-2 py-1 text-xs text-gray-400 transition hover:border-gray-500 hover:text-gray-100 sm:inline-flex"
              >
                <Github className="h-3.5 w-3.5" />
                GitHub
              </a>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
