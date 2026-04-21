import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Factory as FactoryIcon, Github } from "lucide-react";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

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
    <html lang="en" className="dark h-dvh overflow-hidden">
      <body className="flex h-full min-h-0 flex-col overflow-hidden bg-surface text-gray-100 antialiased">
        <header className="sticky top-0 z-40 shrink-0 border-b border-surface-border bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex min-h-12 max-w-[1800px] items-center gap-2 px-3 sm:gap-4 sm:px-4">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 text-sm font-semibold"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/15 text-brand">
                <FactoryIcon className="h-3.5 w-3.5" />
              </span>
              <span>{APP_NAME}</span>
              <span className="hidden text-xs font-normal text-gray-500 sm:inline">
                {APP_TAGLINE}
              </span>
            </Link>
            <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm text-gray-400 sm:flex-none sm:gap-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link
                href="/"
                className="shrink-0 touch-manipulation rounded px-2 py-2 hover:bg-surface-raised hover:text-gray-100 sm:py-1"
              >
                Planner
              </Link>
              <Link
                href="/recipes"
                className="shrink-0 touch-manipulation rounded px-2 py-2 hover:bg-surface-raised hover:text-gray-100 sm:py-1"
              >
                Recipes
              </Link>
              <Link
                href="/buildings"
                className="shrink-0 touch-manipulation rounded px-2 py-2 hover:bg-surface-raised hover:text-gray-100 sm:py-1"
              >
                Buildings
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <a
                href="https://github.com/rip-en/FICS-Planner"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-1.5 rounded-md border border-surface-border px-2 py-1 text-xs text-gray-400 transition hover:border-gray-500 hover:text-gray-100 sm:inline-flex"
              >
                <Github className="h-3.5 w-3.5" />
                GitHub
              </a>
            </div>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
          {children}
        </div>
      </body>
    </html>
  );
}
