"use client";

import { Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { CatalogPanel } from "@/components/catalog/catalog-panel";
import { DetailDrawer } from "@/components/item-detail/detail-drawer";
import { AutomationBundlePanel } from "@/components/planner/automation-bundle-panel";
import { InventoryBudgetPanel } from "@/components/planner/inventory-budget-panel";
import {
  MobilePlannerTabs,
  type MobilePlannerTab,
} from "@/components/planner/mobile-planner-tabs";
import {
  PlanToolbar,
  type PlannerSectionSetting,
} from "@/components/planner/plan-toolbar";
import { ExternalSupplyPanel } from "@/components/planner/external-supply-panel";
import { TargetsPanel } from "@/components/planner/targets-panel";
import { AltRecipeToggles } from "@/components/planner/alt-recipes-toggles";
import { ResultsTable } from "@/components/planner/results-table";
import { getRecipe, recipesProducing } from "@/lib/data";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { computeProducibleItemIds } from "@/lib/planner/inventory-insight";
import {
  decodePlansFromSharePayload,
  parseHashPlanFragment,
} from "@/lib/plan-share";
import { solvePlan } from "@/lib/planner/solver";
import {
  DEFAULT_PLANNER_CONFIG,
  type SolverResult,
} from "@/lib/planner/types";
import {
  useActivePlan,
  useActiveTargets,
  usePlannerStore,
} from "@/lib/store/planner-store";
import { cn } from "@/lib/utils";

/** Stable fallbacks — inline `[]` / `{}` break referential equality every render. */
const STABLE_EMPTY_STRING_LIST: string[] = [];
const STABLE_EMPTY_ALT_INPUT_RATIOS: Record<string, number> = {};

const DASHBOARD_SECTION_SETTINGS: PlannerSectionSetting[] = [
  { id: "inventory-budget", label: "Raw budgets panel" },
  { id: "capped-inputs", label: "Capped inputs" },
  { id: "target-throughput", label: "Target throughput" },
  { id: "suggestions", label: "Suggestions" },
  { id: "automation-bundles", label: "Automation bundles" },
  { id: "targets", label: "Targets" },
  { id: "external-supply", label: "External supply / omit" },
  { id: "recipe-toggles", label: "Recipe toggles" },
  { id: "results", label: "Results panel" },
  { id: "summary-cards", label: "Summary cards" },
  { id: "flow-diagram", label: "Flow diagram" },
  { id: "outstanding-materials", label: "Materials still needed" },
  { id: "recipes-in-use", label: "Recipes in use" },
  { id: "production-chains", label: "Production chains" },
  { id: "missing-inputs", label: "Missing inputs" },
  { id: "raw-inputs", label: "Raw inputs" },
  { id: "already-made-inputs", label: "Already-made inputs" },
  { id: "byproducts", label: "Byproducts" },
];

const HIDDEN_DASHBOARD_SECTIONS_STORAGE_KEY =
  "factory:hidden-dashboard-sections";

/** Collapsible card id to expand when a nested toolbar section is shown again. */
function panelExpandKeyForSection(sectionId: string): string | undefined {
  switch (sectionId) {
    case "inventory-budget":
    case "capped-inputs":
    case "target-throughput":
    case "suggestions":
      return "inventory-budget";
    case "automation-bundles":
      return "automation-bundles";
    case "targets":
      return "targets-panel";
    case "recipe-toggles":
      return "alt-recipes";
    case "external-supply":
      return "external-supply";
    default:
      return undefined;
  }
}

export function Dashboard() {
  const { plan } = useActivePlan();
  const addTarget = usePlannerStore((s) => s.addTarget);
  const setTargetRate = usePlannerStore((s) => s.setTargetRate);
  const targets = useActiveTargets();
  const toggleAlternate = usePlannerStore((s) => s.toggleAlternate);
  const toggleDisabled = usePlannerStore((s) => s.toggleDisabled);
  const lockRecipe = usePlannerStore((s) => s.useOnlyThisRecipe);
  const setProvidedInput = usePlannerStore((s) => s.setProvidedInput);

  const [history, setHistory] = useState<string[]>([]);
  const selected = history[history.length - 1];
  const isDesktopLayout = useMediaQuery("(min-width: 1024px)");
  const [mobileTab, setMobileTab] = useState<MobilePlannerTab>("plan");
  const [hiddenSectionIds, setHiddenSectionIds] = useState<string[]>([]);
  const [panelExpandRevision, setPanelExpandRevision] = useState<
    Record<string, number>
  >({});
  const [sectionPrefsReady, setSectionPrefsReady] = useState(false);
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [solverWorking, setSolverWorking] = useState(false);
  const [hubProducibleItemIds, setHubProducibleItemIds] = useState<
    Set<string> | null
  >(null);
  const [hubTierScanPending, setHubTierScanPending] = useState(false);

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

  useEffect(() => {
    const applyPlanFromUrlHash = () => {
      const encoded = parseHashPlanFragment(window.location.hash);
      if (!encoded) return;
      const parsed = decodePlansFromSharePayload(encoded);
      if (!parsed.ok) return;
      usePlannerStore
        .getState()
        .replacePlans(parsed.data.plans, parsed.data.activePlanId);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    };

    const unsubHydration = usePlannerStore.persist.onFinishHydration(() => {
      applyPlanFromUrlHash();
    });
    if (usePlannerStore.persist.hasHydrated()) {
      applyPlanFromUrlHash();
    }
    return unsubHydration;
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        HIDDEN_DASHBOARD_SECTIONS_STORAGE_KEY,
      );
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const knownSectionIds = new Set(
            DASHBOARD_SECTION_SETTINGS.map((section) => section.id),
          );
          const filtered = parsed.filter(
            (sectionId): sectionId is string =>
              typeof sectionId === "string" && knownSectionIds.has(sectionId),
          );
          setHiddenSectionIds(filtered);
        }
      }
    } catch {
      // Ignore invalid localStorage payload and keep defaults.
    }
    setSectionPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!sectionPrefsReady) return;
    window.localStorage.setItem(
      HIDDEN_DASHBOARD_SECTIONS_STORAGE_KEY,
      JSON.stringify(hiddenSectionIds),
    );
  }, [hiddenSectionIds, sectionPrefsReady]);

  const hiddenSectionIdSet = useMemo(
    () => new Set(hiddenSectionIds),
    [hiddenSectionIds],
  );

  const handleToggleSectionVisibility = useCallback((sectionId: string) => {
    setHiddenSectionIds((previousIds) => {
      const wasHidden = previousIds.includes(sectionId);
      if (wasHidden) {
        const panelKey = panelExpandKeyForSection(sectionId);
        if (panelKey) {
          queueMicrotask(() => {
            setPanelExpandRevision((prev) => ({
              ...prev,
              [panelKey]: (prev[panelKey] ?? 0) + 1,
            }));
          });
        }
        return previousIds.filter((id) => id !== sectionId);
      }
      return [...previousIds, sectionId];
    });
  }, []);

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

  useLayoutEffect(() => {
    if (!plan) {
      setSolverWorking(false);
      return;
    }
    setSolverWorking(true);
  }, [plan]);

  useEffect(() => {
    if (!plan) {
      setSolverResult(null);
      setHubProducibleItemIds(null);
      setHubTierScanPending(false);
      setSolverWorking(false);
      return;
    }

    let cancelled = false;
    let hubTimer: number | undefined;

    const mainTimer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        setSolverResult(solvePlan(plan.config));
      } finally {
        if (!cancelled) setSolverWorking(false);
      }

      if (cancelled) return;

      if (plan.config.maxCompletedHubTier === undefined) {
        setHubProducibleItemIds(null);
        setHubTierScanPending(false);
        return;
      }

      setHubTierScanPending(true);
      setHubProducibleItemIds(null);
      hubTimer = window.setTimeout(() => {
        if (cancelled) return;
        try {
          setHubProducibleItemIds(computeProducibleItemIds(plan.config));
        } finally {
          if (!cancelled) setHubTierScanPending(false);
        }
      }, 0);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(mainTimer);
      if (hubTimer !== undefined) window.clearTimeout(hubTimer);
    };
  }, [plan]);

  const recipesInUse = useMemo(
    () =>
      solverResult?.recipes.map((r) => r.recipeId) ?? STABLE_EMPTY_STRING_LIST,
    [solverResult],
  );
  const enabledAlternates =
    plan?.config.enabledAlternates ?? DEFAULT_PLANNER_CONFIG.enabledAlternates;
  const disabledRecipes =
    plan?.config.disabledRecipes ?? DEFAULT_PLANNER_CONFIG.disabledRecipes;

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
            hubProducibleItemIds={hubProducibleItemIds}
            hubTierScanPending={hubTierScanPending}
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
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-5">
            {plan &&
              (solverWorking || hubTierScanPending) && (
                <div
                  className="card flex items-start gap-3 border-brand/25 bg-brand/5 p-3"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2
                    className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand"
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-1.5 text-xs leading-relaxed text-gray-300">
                    {solverWorking && (
                      <p>
                        <span className="font-medium text-gray-200">
                          Solving production plan
                        </span>
                        {" — "}
                        running the linear program for{" "}
                        <span className="num text-brand">
                          {plan.config.targets.length}
                        </span>{" "}
                        target
                        {plan.config.targets.length === 1 ? "" : "s"} (recipe
                        rates, raw intake, power/buildings).
                      </p>
                    )}
                    {hubTierScanPending && (
                      <p>
                        <span className="font-medium text-gray-200">
                          Hub tier catalog scan
                        </span>
                        {" — "}
                        checking each craftable item for feasibility under your
                        milestone gate (this can take a few seconds).
                      </p>
                    )}
                  </div>
                </div>
              )}
            <PlanToolbar
              sectionSettings={DASHBOARD_SECTION_SETTINGS}
              hiddenSectionIds={hiddenSectionIds}
              onToggleSectionVisibility={handleToggleSectionVisibility}
            />
            {plan && !hiddenSectionIdSet.has("inventory-budget") && (
              <InventoryBudgetPanel
                config={plan.config}
                hiddenSectionIds={hiddenSectionIds}
                expandPanelRevision={panelExpandRevision["inventory-budget"] ?? 0}
                onInspect={pushItem}
                onAddTargetAtRate={(itemId, rate) => {
                  if (targets.some((t) => t.itemId === itemId))
                    setTargetRate(itemId, rate);
                  else addTarget(itemId, rate);
                }}
              />
            )}
            {plan && !hiddenSectionIdSet.has("automation-bundles") && (
              <AutomationBundlePanel
                config={plan.config}
                onInspect={pushItem}
                expandPanelRevision={
                  panelExpandRevision["automation-bundles"] ?? 0
                }
              />
            )}
            {!hiddenSectionIdSet.has("targets") && (
              <TargetsPanel
                expandPanelRevision={
                  panelExpandRevision["targets-panel"] ?? 0
                }
                targets={
                  plan?.config.targets ?? DEFAULT_PLANNER_CONFIG.targets
                }
                config={plan?.config ?? DEFAULT_PLANNER_CONFIG}
                hubProducibleItemIds={hubProducibleItemIds}
                hubTierScanPending={hubTierScanPending}
                onInspect={pushItem}
              />
            )}
            {plan && !hiddenSectionIdSet.has("external-supply") && (
              <ExternalSupplyPanel
                config={plan.config}
                onInspect={pushItem}
                expandPanelRevision={
                  panelExpandRevision["external-supply"] ?? 0
                }
              />
            )}
            {!hiddenSectionIdSet.has("recipe-toggles") && (
              <AltRecipeToggles
                enabled={enabledAlternates}
                recipesInUse={recipesInUse}
                alternateInputRatios={
                  plan?.config.alternateInputRatios ?? STABLE_EMPTY_ALT_INPUT_RATIOS
                }
                expandPanelRevision={panelExpandRevision["alt-recipes"] ?? 0}
              />
            )}
            {!hiddenSectionIdSet.has("results") && solverResult && (
              <ResultsTable
                result={solverResult}
                onInspect={pushItem}
                fullyProvidedInputs={
                  plan?.config.providedInputs ?? STABLE_EMPTY_STRING_LIST
                }
                onToggleProvidedInput={setProvidedInput}
                hiddenSectionIds={hiddenSectionIds}
              />
            )}
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
            providedInputs={
              plan?.config.providedInputs ?? STABLE_EMPTY_STRING_LIST
            }
            onToggleProvidedInput={setProvidedInput}
            addTargetBlockedByHub={
              selected != null &&
              !hubTierScanPending &&
              hubProducibleItemIds != null &&
              !hubProducibleItemIds.has(selected)
            }
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
