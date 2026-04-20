"use client";

import { useCallback, useMemo, useState } from "react";
import { CatalogPanel } from "@/components/catalog/catalog-panel";
import { DetailDrawer } from "@/components/item-detail/detail-drawer";
import { HydrationGuard } from "@/components/hydration-guard";
import { InventoryBudgetPanel } from "@/components/planner/inventory-budget-panel";
import { PlanToolbar } from "@/components/planner/plan-toolbar";
import { TargetsPanel } from "@/components/planner/targets-panel";
import { AltRecipeToggles } from "@/components/planner/alt-recipes-toggles";
import { ResultsTable } from "@/components/planner/results-table";
import { getRecipe, recipesProducing } from "@/lib/data";
import { solvePlan } from "@/lib/planner/solver";
import {
  useActivePlan,
  useActiveTargets,
  usePlannerStore,
} from "@/lib/store/planner-store";

export function Dashboard() {
  const { plan } = useActivePlan();
  const addTarget = usePlannerStore((s) => s.addTarget);
  const setTargetRate = usePlannerStore((s) => s.setTargetRate);
  const targets = useActiveTargets();
  const toggleAlternate = usePlannerStore((s) => s.toggleAlternate);
  const toggleDisabled = usePlannerStore((s) => s.toggleDisabled);
  const lockRecipe = usePlannerStore((s) => s.useOnlyThisRecipe);

  const [history, setHistory] = useState<string[]>([]);
  const selected = history[history.length - 1];
  const pushItem = useCallback((id: string) => {
    setHistory((prev) => (prev[prev.length - 1] === id ? prev : [...prev, id]));
  }, []);
  const back = useCallback(() => {
    setHistory((prev) => (prev.length <= 1 ? prev : prev.slice(0, -1)));
  }, []);
  const close = useCallback(() => setHistory([]), []);

  const handleAddTarget = useCallback(
    (itemId: string) => addTarget(itemId),
    [addTarget],
  );

  const handleUseOnlyThis = useCallback(
    (recipeId: string) => {
      const recipe = getRecipe(recipeId);
      if (!recipe) return;
      const competitors = new Set<string>();
      for (const product of recipe.products) {
        for (const alt of recipesProducing(product.item)) {
          if (alt.id !== recipeId) competitors.add(alt.id);
        }
      }
      lockRecipe(recipeId, Array.from(competitors));
    },
    [lockRecipe],
  );

  const result = useMemo(() => {
    if (!plan) return null;
    return solvePlan(plan.config);
  }, [plan]);

  const recipesInUse = useMemo(
    () => result?.recipes.map((r) => r.recipeId) ?? [],
    [result],
  );
  const enabledAlternates = plan?.config.enabledAlternates ?? [];
  const disabledRecipes = plan?.config.disabledRecipes ?? [];

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-0">
      <div className="w-[300px] min-w-[260px] shrink-0">
        <CatalogPanel
          selectedItemId={selected}
          onSelect={pushItem}
          onAddTarget={handleAddTarget}
        />
      </div>

      <main className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <HydrationGuard
            fallback={<div className="h-10 animate-pulse rounded-md bg-surface-raised" />}
          >
            <PlanToolbar />
            {plan && (
              <InventoryBudgetPanel
                config={plan.config}
                onInspect={pushItem}
                onAddTargetAtRate={(itemId, rate) => {
                  if (targets.some((t) => t.itemId === itemId))
                    setTargetRate(itemId, rate);
                  else addTarget(itemId, rate);
                }}
              />
            )}
            <TargetsPanel
              targets={plan?.config.targets ?? []}
              onInspect={pushItem}
            />
            <AltRecipeToggles
              enabled={enabledAlternates}
              recipesInUse={recipesInUse}
            />
            {result && <ResultsTable result={result} onInspect={pushItem} />}
          </HydrationGuard>
        </div>
      </main>

      <div
        className={
          selected
            ? "w-[420px] min-w-[360px] shrink-0"
            : "w-[280px] min-w-[260px] shrink-0"
        }
      >
        <DetailDrawer
          itemId={selected}
          historyLength={history.length}
          enabledAlternates={enabledAlternates}
          disabledRecipes={disabledRecipes}
          recipesInUse={recipesInUse}
          onBack={back}
          onClose={close}
          onSelect={pushItem}
          onAddTarget={handleAddTarget}
          onToggleAlternate={toggleAlternate}
          onToggleDisabled={toggleDisabled}
          onUseOnlyThis={handleUseOnlyThis}
        />
      </div>
    </div>
  );
}
