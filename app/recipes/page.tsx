import Link from "next/link";
import { RecipesGroupedView } from "@/components/reference/recipes-grouped-view";
import { allRecipes } from "@/lib/data";

export const metadata = { title: "Recipes" };

export default function RecipesPage() {
  const count = allRecipes().filter((r) => r.inMachine).length;

  return (
    <main className="mx-auto max-w-6xl p-4 pb-8 sm:p-6">
      <nav className="mb-4 text-xs text-gray-500">
        <Link href="/" className="hover:text-gray-200">
          ← Back to Planner
        </Link>
      </nav>
      <h1 className="mb-4 text-2xl font-semibold">
        All recipes{" "}
        <span className="text-sm font-normal text-gray-500">({count})</span>
      </h1>
      <RecipesGroupedView />
    </main>
  );
}
