import Link from "next/link";
import { RecipeCard } from "@/components/item-detail/recipe-card";
import { allRecipes } from "@/lib/data";

export const metadata = { title: "Recipes" };

export default function RecipesPage() {
  const recipes = allRecipes()
    .filter((r) => r.inMachine)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto max-w-6xl p-4 pb-8 sm:p-6">
      <nav className="mb-4 text-xs text-gray-500">
        <Link href="/" className="hover:text-gray-200">
          ← Back to Planner
        </Link>
      </nav>
      <h1 className="mb-4 text-2xl font-semibold">
        All recipes{" "}
        <span className="text-sm font-normal text-gray-500">
          ({recipes.length})
        </span>
      </h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {recipes.map((r) => (
          <RecipeCard key={r.id} recipe={r} />
        ))}
      </div>
    </main>
  );
}
