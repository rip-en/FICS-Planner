import Link from "next/link";
import { BuildingsGroupedView } from "@/components/reference/buildings-grouped-view";
import { allBuildings } from "@/lib/data";

export const metadata = { title: "Buildings" };

export default function BuildingsPage() {
  const count = allBuildings().filter((b) => b.kind !== "other").length;

  return (
    <main className="mx-auto max-w-5xl p-4 pb-8 sm:p-6">
      <nav className="mb-4 text-xs text-gray-500">
        <Link href="/" className="hover:text-gray-200">
          ← Back to Planner
        </Link>
      </nav>
      <h1 className="mb-4 text-2xl font-semibold">
        Buildings{" "}
        <span className="text-sm font-normal text-gray-500">({count})</span>
      </h1>
      <BuildingsGroupedView />
    </main>
  );
}
