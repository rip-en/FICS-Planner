"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CatalogPanel } from "@/components/catalog/catalog-panel";
import { DetailDrawer } from "@/components/item-detail/detail-drawer";
import { HydrationGuard } from "@/components/hydration-guard";
import { AutomationBundlePanel } from "@/components/planner/automation-bundle-panel";
import { InventoryBudgetPanel } from "@/components/planner/inventory-budget-panel";
import {
  MobilePlannerTabs,
  type MobilePlannerTab,
} from "@/components/planner/mobile-planner-tabs";
import { PlanToolbar } from "@/components/planner/plan-toolbar";
import { TargetsPanel } from "@/components/planner/targets-panel";
import { AltRecipeToggles } from "@/components/planner/alt-recipes-toggles";
import { ResultsTable } from "@/components/planner/results-table";
import { getRecipe, recipesProducing } from "@/lib/data";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { solvePlan } from "@/lib/planner/solver";
import {
  useActivePlan,
  useActiveTargets,
  usePlannerStore,
} from "@/lib/store/planner-store";
import { cn } from "@/lib/utils";

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
  const isDesktopLayout = useMediaQuery("(min-width: 1024px)");
  const [mobileTab, setMobileTab] = useState<MobilePlannerTab>("plan");

  const pushItem = useCallback((id: string) => {
    setHistory((prev) => (prev[prev.length - 1] === id ? prev : [...prev, id]));
  }, []);
  const back = useCallback(() => {
    setHistory((prev) => (prev.length <= 1 ? prev : prev.slice(0, -1)));
  }, []);
  const close = useCallback(() => {
    setHistory([]);
    if (!isDesktopLayout) setMobileTab("plan");
  }, [isDesktopLayout]);

  useEffect(() => {
    if (isDesktopLayout) return;
    if (selected) setMobileTab("detail");
  }, [selected, isDesktopLayout]);

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
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-surface lg:flex-row",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={cn(
            "min-h-0 shrink-0 border-surface-border lg:flex lg:h-full lg:w-[300px] lg:min-w-[260px] lg:flex-col lg:border-r",
            isDesktopLayout
              ? "flex flex-col"
              : mobileTab === "catalog"
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden",
          )}
        >
          <CatalogPanel
            selectedItemId={selected}
            onSelect={pushItem}
            onAddTarget={handleAddTarget}
          />
        </div>

        <main
          className={cn(
            "min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:min-h-0",
            !isDesktopLayout && mobileTab !== "plan" && "hidden",
          )}
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:gap-4">
            <HydrationGuard
              fallback={
                <div className="h-10 animate-pulse rounded-md bg-surface-raised" />
              }
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
              {plan && (
                <AutomationBundlePanel
                  config={plan.config}
                  onInspect={pushItem}
                />
              )}
              <TargetsPanel
                targets={plan?.config.targets ?? []}
                config={
                  plan?.config ?? {
                    targets: [],
                    enabledAlternates: [],
                    disabledRecipes: [],
                    objective: "buildings",
                    rawCaps: undefined,
                    excludedRawInputs: undefined,
                  }
                }
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
          className={cn(
            "min-h-0 shrink-0 border-surface-border lg:h-full lg:border-l",
            isDesktopLayout
              ? selected
                ? "flex w-[420px] min-w-[360px] flex-col"
                : "flex w-[280px] min-w-[260px] flex-col"
              : mobileTab === "detail"
                ? "flex min-h-0 flex-1 flex-col"
                : "hidden",
          )}
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

      <MobilePlannerTabs
        active={mobileTab}
        onChange={setMobileTab}
      />
    </div>
  );
}
