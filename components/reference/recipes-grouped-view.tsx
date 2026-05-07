"use client";

import { useMemo } from "react";
import { RecipeCard } from "@/components/item-detail/recipe-card";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { allRecipes, getBuilding } from "@/lib/data";
import type { Recipe } from "@/types/game";

function groupRecipesByMachine(recipes: Recipe[]) {
  const map = new Map<string, Recipe[]>();
  for (const r of recipes) {
    const building = r.producedIn[0] ? getBuilding(r.producedIn[0]) : undefined;
    const key = building?.name ?? "Other / unpackaged";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function RecipesGroupedView() {
  const groups = useMemo(() => {
    const list = allRecipes().filter((r) => r.inMachine);
    return groupRecipesByMachine(list);
  }, []);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-gray-500">No machine recipes in the dataset.</p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([machineName, recipes]) => (
        <CollapsibleSection
          key={machineName}
          variant="panel"
          title={`${machineName} · ${recipes.length}`}
          defaultOpen
          contentClassName="space-y-3"
        >
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </CollapsibleSection>
      ))}
    </div>
  );
}
