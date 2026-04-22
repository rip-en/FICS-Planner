"use client";

import Fuse from "fuse.js";
import { Hash, Layers, Loader2, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemIcon } from "@/components/item-icon";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SearchInput } from "@/components/ui/search-input";
import { allItems, getItem } from "@/lib/data";
import {
  canOfferBeltSnap,
  oneMachineLayerRates,
  suggestBundleBeltSnapRates,
  suggestBundlePerfectRates,
  suggestBundleTargetRates,
} from "@/lib/planner/bundle-insight";
import type { PlannerConfig } from "@/lib/planner/types";
import { solvePlan } from "@/lib/planner/solver";
import { usePlannerStore } from "@/lib/store/planner-store";
import { cn, formatRate } from "@/lib/utils";

interface AutomationBundlePanelProps {
  config: PlannerConfig;
  onInspect: (itemId: string) => void;
}

interface PathMetrics {
  feasible: boolean;
  rawTotal: number;
  byproductTotal: number;
  totalBuildings: number;
}

interface PathOption {
  id: string;
  label: string;
  hint: string;
  objective: PlannerConfig["objective"];
  rates: Record<string, number>;
  metrics: PathMetrics;
}

interface DerivedBundleState {
  preview: ReturnType<typeof suggestBundleTargetRates> | null;
  beltSnap: ReturnType<typeof suggestBundleBeltSnapRates> | null;
  pathOptions: PathOption[];
}

const EMPTY_DERIVED: DerivedBundleState = {
  preview: null,
  beltSnap: null,
  pathOptions: [],
};

function evaluateRates(
  config: PlannerConfig,
  rates: Record<string, number>,
  objective: PlannerConfig["objective"],
): PathMetrics {
  const targets = Object.entries(rates).map(([itemId, rate]) => ({
    itemId,
    rate,
  }));
  const plan = solvePlan({ ...config, objective, targets });
  const rawTotal = plan.rawInputs.reduce((sum, row) => sum + row.ratePerMin, 0);
  const byproductTotal = plan.byproducts.reduce(
    (sum, row) => sum + row.ratePerMin,
    0,
  );
  return {
    feasible: plan.feasible,
    rawTotal,
    byproductTotal,
    totalBuildings: plan.totalBuildings,
  };
}

function buildDerivedBundleState(
  config: PlannerConfig,
  draftIds: string[],
): DerivedBundleState {
  const hasCaps =
    config.rawCaps !== undefined && Object.keys(config.rawCaps).length > 0;
  const preview = suggestBundleTargetRates(config, draftIds);
  const beltSnap =
    canOfferBeltSnap(hasCaps, preview)
      ? suggestBundleBeltSnapRates(config, draftIds, { suggestion: preview })
      : null;
  const perfect = suggestBundlePerfectRates(config, draftIds);
  const maxRates = preview?.rates ?? oneMachineLayerRates(config, draftIds);
  const pathOptions: PathOption[] = [
    {
      id: "path-min-buildings",
      label: "Path: min buildings",
      hint: "Uses current bundle scale and solves with building count priority.",
      objective: "buildings",
      rates: maxRates,
      metrics: evaluateRates(config, maxRates, "buildings"),
    },
    {
      id: "path-min-raw",
      label: "Path: min raw inputs",
      hint: "Same bundle targets, solved with raw input priority.",
      objective: "raw",
      rates: maxRates,
      metrics: evaluateRates(config, maxRates, "raw"),
    },
  ];

  if (perfect) {
    pathOptions.push({
      id: "path-perfect-numbers",
      label: "Path: perfect-ish numbers",
      hint: "Searches bundle scales for cleaner raw/byproduct rates (180/120/100/60/50/30).",
      objective: "raw",
      rates: perfect.rates,
      metrics: evaluateRates(config, perfect.rates, "raw"),
    });
  }

  return { preview, beltSnap, pathOptions };
}

export function AutomationBundlePanel({
  config,
  onInspect,
}: AutomationBundlePanelProps) {
  const upsertTarget = usePlannerStore((s) => s.upsertTarget);
  const setObjective = usePlannerStore((s) => s.setObjective);

  const craftable = useMemo(
    () => allItems().filter((it) => !it.isRaw),
    [],
  );
  const fuse = useMemo(
    () =>
      new Fuse(craftable, {
        keys: ["name", "slug"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [craftable],
  );

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const computeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewCache = useRef(new Map<string, DerivedBundleState>());

  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [isComputing, setIsComputing] = useState(false);

  const hits = useMemo(() => {
    const q = query.trim();
    if (!q) return craftable.slice(0, 12);
    return fuse.search(q).map((h) => h.item).slice(0, 12);
  }, [query, fuse, craftable]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const addDraft = useCallback((itemId: string) => {
    setDraftIds((prev) =>
      prev.includes(itemId) ? prev : [...prev, itemId],
    );
    setQuery("");
    setOpen(false);
  }, []);

  const removeDraft = useCallback((itemId: string) => {
    setDraftIds((prev) => prev.filter((id) => id !== itemId));
  }, []);

  const applyRates = useCallback(
    (rates: Record<string, number>) => {
      for (const [itemId, rate] of Object.entries(rates)) {
        if (rate <= 0) continue;
        upsertTarget(itemId, rate);
      }
    },
    [upsertTarget],
  );

  const applyPath = useCallback(
    (
      rates: Record<string, number>,
      objective?: PlannerConfig["objective"],
    ) => {
      if (objective) setObjective(objective);
      applyRates(rates);
    },
    [applyRates, setObjective],
  );

  const handleOneMachineEach = useCallback(() => {
    if (draftIds.length === 0) return;
    applyPath(oneMachineLayerRates(config, draftIds));
  }, [applyPath, config, draftIds]);

  const handleMaxUnderCaps = useCallback(() => {
    if (draftIds.length === 0) return;
    const suggestion = suggestBundleTargetRates(config, draftIds);
    applyPath(suggestion.rates, config.objective);
  }, [applyPath, config, draftIds]);

  const hasCaps =
    config.rawCaps !== undefined && Object.keys(config.rawCaps).length > 0;
  const [derived, setDerived] = useState<DerivedBundleState>(EMPTY_DERIVED);

  const draftSignature = useMemo(
    () => [...draftIds].sort().join("|"),
    [draftIds],
  );
  const configSignature = useMemo(
    () =>
      JSON.stringify({
        rawCaps: config.rawCaps ?? {},
        objective: config.objective,
        enabledAlternates: [...config.enabledAlternates].sort(),
        disabledRecipes: [...config.disabledRecipes].sort(),
      }),
    [config.disabledRecipes, config.enabledAlternates, config.objective, config.rawCaps],
  );
  const cacheKey = `${draftSignature}::${configSignature}`;

  useEffect(() => {
    if (computeTimer.current !== null) {
      clearTimeout(computeTimer.current);
      computeTimer.current = null;
    }
    if (draftIds.length === 0) {
      setDerived(EMPTY_DERIVED);
      setIsComputing(false);
      return;
    }

    const cached = previewCache.current.get(cacheKey);
    if (cached) {
      setDerived(cached);
      setIsComputing(false);
      return;
    }

    setIsComputing(true);
    computeTimer.current = setTimeout(() => {
      const next = buildDerivedBundleState(config, draftIds);
      previewCache.current.set(cacheKey, next);
      setDerived(next);
      setIsComputing(false);
      computeTimer.current = null;
    }, 0);

    return () => {
      if (computeTimer.current !== null) {
        clearTimeout(computeTimer.current);
        computeTimer.current = null;
      }
    };
  }, [cacheKey, config, draftIds]);

  const preview = derived.preview;
  const beltSnap = derived.beltSnap;
  const pathOptions = derived.pathOptions;

  const handleBeltSnap = useCallback(() => {
    if (draftIds.length === 0) return;
    if (!beltSnap || beltSnap.noop) return;
    applyPath(beltSnap.rates, "raw");
  }, [applyPath, beltSnap, draftIds.length]);

  return (
    <div className="card flex flex-col gap-3 p-3 sm:gap-4 sm:p-4">
      <header>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Multi-item automation
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Pick several end products (for example Radio Control Unit and Crystal
          Oscillator). Apply starter rates from one machine each, or scale the
          whole bundle to fit your raw budgets. Fractional raw pulls (for example
          147/min ore) usually mean the bundle scale sits between clean belt
          lines — use{" "}
          <span className="font-medium text-gray-400">Tidy raw (÷60)</span> after
          max-under-caps, or nudge individual targets in Targets until raw inputs
          land on numbers you like (60 / 120 / 180 per minute per Mk belt tier).
        </p>
      </header>

      <CollapsibleSection
        variant="panel"
        title="Bundle"
        defaultOpen
        contentClassName="space-y-3"
      >
        <div className="relative">
          <SearchInput
            label="Add item to bundle"
            value={query}
            onChange={(q) => {
              cancelClose();
              setQuery(q);
              setOpen(q.trim().length > 0);
            }}
            onFocus={() => {
              cancelClose();
              if (query.trim().length > 0) setOpen(true);
            }}
            onBlur={() => {
              cancelClose();
              closeTimer.current = setTimeout(() => {
                setOpen(false);
                closeTimer.current = null;
              }, 150);
            }}
            placeholder="Search items…"
            size="sm"
          />
          {open && query.trim().length > 0 && (
            <ul
              role="listbox"
              aria-label="Matching items"
              className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-surface-border bg-surface-raised py-1 shadow-lg"
            >
              {hits.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={draftIds.includes(it.id)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      cancelClose();
                      addDraft(it.id);
                    }}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface"
                  >
                    <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={22} />
                    <span className="truncate">{it.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {draftIds.length === 0 ? (
          <p className="rounded-md border border-dashed border-surface-border p-3 text-xs text-gray-500">
            Add one or more items to preview and apply a flow.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {draftIds.map((id) => {
              const it = getItem(id);
              if (!it) return null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-1 rounded-full border border-surface-border bg-surface py-1 pl-1 pr-0.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onInspect(id)}
                    className="flex items-center gap-1 rounded-l-full px-1.5 hover:text-brand"
                  >
                    <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={20} />
                    <span className="max-w-[9rem] truncate font-medium">
                      {it.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDraft(id)}
                    className="rounded-full p-1 text-gray-500 hover:bg-surface-border hover:text-gray-200"
                    aria-label={`Remove ${it.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {isComputing && draftIds.length > 0 && (
          <div className="rounded-md border border-surface-border bg-surface p-3 text-xs text-gray-400">
            <div className="flex items-center gap-2 text-gray-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Computing bundle paths and raw fit...
            </div>
          </div>
        )}

        {!isComputing && preview && draftIds.length > 0 && (
          <div className="rounded-md border border-surface-border bg-surface p-3 text-xs text-gray-400">
            <div className="mb-2 font-medium text-gray-300">Preview</div>
            <ul className="space-y-1.5">
              {draftIds.map((id) => {
                const it = getItem(id);
                const r = preview.rates[id] ?? 0;
                return (
                  <li key={id} className="flex justify-between gap-2">
                    <span className="truncate text-gray-300">
                      {it?.name ?? id}
                    </span>
                    <span className="num shrink-0 text-brand">
                      {formatRate(r)} /min
                    </span>
                  </li>
                );
              })}
            </ul>
            {preview.unbounded && hasCaps === false && (
              <p className="mt-2 text-amber-200/85">
                Raw inputs are unlimited until you add budgets below — any finite
                rates work; one machine each is a practical starting point.
              </p>
            )}
            {preview.unbounded && hasCaps && (
              <p className="mt-2 text-gray-500">
                Caps do not bind this bundle yet — scale is effectively open.
              </p>
            )}
            {!preview.unbounded && preview.scale > 0 && (
              <p className="mt-2 text-gray-500">
                Largest joint scale under your caps:{" "}
                <span className="num text-gray-300">
                  ×{preview.scale.toFixed(3)}
                </span>{" "}
                (relative to one machine output per product).
              </p>
            )}
            {preview.infeasibleAtUnitScale && preview.scale > 0 && (
              <p className="mt-2 text-amber-200/85">
                One full machine of each does not fit; applied the largest
                smaller bundle instead.
              </p>
            )}
            {hasCaps && preview.unbounded && draftIds.length > 0 && (
              <p className="mt-2 text-gray-500">
                Raw budgets are not binding yet, so there is no fixed “ceiling” to
                snap against. Tighten a cap or set targets manually, then try belt
                tidy again — or adjust one end product up/down a little; raw
                numbers track those targets proportionally.
              </p>
            )}
            {beltSnap && !beltSnap.noop && (
              <p className="mt-2 text-gray-500">
                Belt tidy (preview): scale the bundle so{" "}
                <button
                  type="button"
                  onClick={() => onInspect(beltSnap.pivotItemId)}
                  className="font-medium text-brand hover:underline"
                >
                  {getItem(beltSnap.pivotItemId)?.name ?? beltSnap.pivotItemId}
                </button>{" "}
                moves from{" "}
                <span className="num text-gray-300">
                  {formatRate(beltSnap.pivotRateBefore)}
                </span>{" "}
                →{" "}
                <span className="num text-gray-300">
                  {formatRate(beltSnap.pivotRateAfter)}
                </span>{" "}
                /min (≤{" "}
                <span className="num text-gray-300">
                  {formatRate(beltSnap.targetPivotRate)}
                </span>{" "}
                /min belt step).
              </p>
            )}
            {beltSnap && beltSnap.noop && canOfferBeltSnap(hasCaps, preview) && (
              <p className="mt-2 text-gray-500">
                Dominant raw for this bundle is already on a{" "}
                {formatRate(beltSnap.stepPerMin, 0)}/min step (after max scale).
              </p>
            )}
            {preview.scale <= 0 && draftIds.length > 0 && (
              <p className="mt-2 text-red-300/90">
                This combination is not feasible with current recipe toggles and
                caps. Enable recipes or raise budgets.
              </p>
            )}
          </div>
        )}

        {!isComputing && pathOptions.length > 0 && (
          <div className="rounded-md border border-surface-border bg-surface p-3 text-xs text-gray-400">
            <div className="mb-2 font-medium text-gray-300">Generated paths</div>
            <div className="space-y-2">
              {pathOptions.map((option) => (
                <div
                  key={option.id}
                  className="rounded border border-surface-border/80 bg-surface-raised p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-200">{option.label}</p>
                    <button
                      type="button"
                      onClick={() => applyPath(option.rates, option.objective)}
                      disabled={!option.metrics.feasible}
                      className="btn px-2 py-1 text-[11px]"
                    >
                      Apply
                    </button>
                  </div>
                  <p className="mt-1 text-gray-500">{option.hint}</p>
                  <p className="mt-1 text-gray-400">
                    Raw:{" "}
                    <span className="num text-gray-300">
                      {formatRate(option.metrics.rawTotal)}
                    </span>{" "}
                    /min, Buildings:{" "}
                    <span className="num text-gray-300">
                      {option.metrics.totalBuildings}
                    </span>
                    , Waste:{" "}
                    <span className="num text-gray-300">
                      {formatRate(option.metrics.byproductTotal)}
                    </span>{" "}
                    /min
                  </p>
                  {!option.metrics.feasible && (
                    <p className="mt-1 text-red-300/90">
                      Not feasible with the current recipe toggles/caps.
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-gray-500">
              Perfect-ish keeps fractional machine counts if needed, but tries to
              make upstream raw and waste rates cleaner so your logistics are easier
              to lay out.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={draftIds.length === 0 || isComputing}
            onClick={handleOneMachineEach}
            className="btn min-h-10 flex-1 touch-manipulation justify-center gap-1.5 text-xs sm:min-h-0"
          >
            <Layers className="h-3.5 w-3.5" />
            Apply: one machine each
          </button>
          <button
            type="button"
            disabled={
              draftIds.length === 0 ||
              isComputing ||
              !hasCaps ||
              (preview !== null && preview.scale <= 0)
            }
            onClick={handleMaxUnderCaps}
            className={cn(
              "btn min-h-10 flex-1 touch-manipulation justify-center gap-1.5 text-xs sm:min-h-0",
              !hasCaps && "opacity-60",
            )}
            title={
              !hasCaps
                ? "Add capped raw inputs first to maximize the bundle against budgets"
                : undefined
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            Apply: max under raw caps
          </button>
          <button
            type="button"
            disabled={
              draftIds.length === 0 ||
              isComputing ||
              preview === null ||
              preview.scale <= 0 ||
              !canOfferBeltSnap(hasCaps, preview) ||
              beltSnap === null ||
              beltSnap.noop
            }
            onClick={handleBeltSnap}
            className="btn min-h-10 flex-1 touch-manipulation justify-center gap-1.5 text-xs sm:min-h-0"
            title={
              preview === null
                ? undefined
                : !canOfferBeltSnap(hasCaps, preview)
                  ? "When caps do not bind the bundle, set stricter budgets or tune targets for clean raw numbers"
                  : beltSnap?.noop
                    ? "Dominant raw is already on a 60/min belt step at this scale"
                    : beltSnap === null
                      ? "This bundle cannot be snapped to a belt step with the current recipe set"
                      : "Scale the bundle down slightly so the heaviest raw lands on a 60/min belt line (e.g. 120 instead of 147)"
            }
          >
            <Hash className="h-3.5 w-3.5" />
            Apply: tidy raw (÷60)
          </button>
        </div>
      </CollapsibleSection>
    </div>
  );
}
