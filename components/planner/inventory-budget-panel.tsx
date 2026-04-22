"use client";

import Fuse from "fuse.js";
import { Lightbulb, LineChart, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemIcon } from "@/components/item-icon";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SearchInput } from "@/components/ui/search-input";
import { allItems, getItem } from "@/lib/data";
import {
  maximizeTargetRate,
  suggestExcessAutomatableItems,
  suggestAutomatableItems,
} from "@/lib/planner/inventory-insight";
import { solvePlan } from "@/lib/planner/solver";
import type { PlannerConfig } from "@/lib/planner/types";
import { usePlannerStore } from "@/lib/store/planner-store";
import { cn, formatRate } from "@/lib/utils";

const EMPTY_RAW_CAPS: Record<string, number> = Object.freeze({});

interface InventoryBudgetPanelProps {
  config: PlannerConfig;
  onInspect: (itemId: string) => void;
  onAddTargetAtRate?: (itemId: string, rate: number) => void;
}

export function InventoryBudgetPanel({
  config,
  onInspect,
  onAddTargetAtRate,
}: InventoryBudgetPanelProps) {
  const setRawCap = usePlannerStore((s) => s.setRawCap);
  const setRawExcluded = usePlannerStore((s) => s.setRawExcluded);
  const clearRawCaps = usePlannerStore((s) => s.clearRawCaps);
  const upsertTarget = usePlannerStore((s) => s.upsertTarget);

  const rawItems = useMemo(
    () => allItems().filter((it) => it.isRaw),
    [],
  );
  const fuse = useMemo(
    () =>
      new Fuse(rawItems, {
        keys: ["name", "slug"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [rawItems],
  );

  const [addQuery, setAddQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"cap" | "exclude">("cap");

  const addHits = useMemo(() => {
    const q = addQuery.trim();
    if (!q) return rawItems.slice(0, 12);
    return fuse.search(q).map((h) => h.item).slice(0, 12);
  }, [addQuery, fuse, rawItems]);

  const caps = useMemo(() => {
    const r = config.rawCaps;
    if (!r || Object.keys(r).length === 0) return EMPTY_RAW_CAPS;
    return r;
  }, [config.rawCaps]);

  const capEntries = Object.entries(caps).sort((a, b) =>
    (getItem(a[0])?.name ?? a[0]).localeCompare(getItem(b[0])?.name ?? b[0]),
  );
  const excludedRawInputs = useMemo(
    () => new Set(config.excludedRawInputs ?? []),
    [config.excludedRawInputs],
  );
  const excludedEntries = useMemo(
    () =>
      Array.from(excludedRawInputs).sort((a, b) =>
        (getItem(a)?.name ?? a).localeCompare(getItem(b)?.name ?? b),
      ),
    [excludedRawInputs],
  );

  const [analyzeId, setAnalyzeId] = useState<string | null>(null);
  const [analyzeQuery, setAnalyzeQuery] = useState("");
  const [analyzeDropdownOpen, setAnalyzeDropdownOpen] = useState(false);
  const analyzeCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelAnalyzeCloseTimer = useCallback(() => {
    if (analyzeCloseTimer.current !== null) {
      clearTimeout(analyzeCloseTimer.current);
      analyzeCloseTimer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (analyzeCloseTimer.current !== null)
        clearTimeout(analyzeCloseTimer.current);
    },
    [],
  );

  const analyzeFuse = useMemo(
    () =>
      new Fuse(allItems(), {
        keys: ["name", "slug"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [],
  );
  const analyzeHits = useMemo(() => {
    const q = analyzeQuery.trim();
    if (!q) return allItems().filter((it) => !it.isRaw).slice(0, 10);
    return analyzeFuse.search(q).map((h) => h.item).filter((it) => !it.isRaw).slice(0, 10);
  }, [analyzeQuery, analyzeFuse]);

  const [insight, setInsight] = useState<ReturnType<
    typeof maximizeTargetRate
  > | null>(null);
  const [suggestions, setSuggestions] = useState<
    ReturnType<typeof suggestAutomatableItems>
  >([]);
  const [excessSuggestions, setExcessSuggestions] = useState<
    ReturnType<typeof suggestExcessAutomatableItems>
  >([]);
  const [excessStatus, setExcessStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"analyze" | "suggest" | "excess" | null>(null);

  const handlePickRaw = useCallback(
    (itemId: string) => {
      if (addMode === "cap") {
        if (caps[itemId] !== undefined || excludedRawInputs.has(itemId)) return;
        setRawCap(itemId, 60);
      } else {
        if (excludedRawInputs.has(itemId)) return;
        setRawExcluded(itemId, true);
      }
      setAddQuery("");
      setShowAdd(false);
    },
    [addMode, caps, excludedRawInputs, setRawCap, setRawExcluded],
  );

  const runAnalyze = useCallback(() => {
    if (!analyzeId) return;
    setBusy("analyze");
    setInsight(null);
    try {
      const r = maximizeTargetRate(config, analyzeId);
      setInsight(r);
    } finally {
      setBusy(null);
    }
  }, [analyzeId, config]);

  const runSuggest = useCallback(() => {
    setBusy("suggest");
    setSuggestions([]);
    try {
      setSuggestions(suggestAutomatableItems(config, { limit: 20 }));
    } finally {
      setBusy(null);
    }
  }, [config]);

  const runSuggestExcess = useCallback(() => {
    setBusy("excess");
    setExcessSuggestions([]);
    setExcessStatus(null);
    try {
      const base = solvePlan(config);
      if (!base.feasible) {
        setExcessStatus(
          "Current targets are not feasible with active caps/recipes. Fix that first, then try extras.",
        );
        return;
      }
      const rows = suggestExcessAutomatableItems(config, { limit: 20 });
      setExcessSuggestions(rows);
      if (rows.length === 0) {
        setExcessStatus(
          "No extra automations fit in the remaining capped input headroom.",
        );
      }
    } finally {
      setBusy(null);
    }
  }, [config]);

  return (
    <div className="card flex flex-col gap-3 p-3 sm:gap-4 sm:p-4">
      <header>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Raw budgets and automation insight
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Set a max supply rate (items/min) for each resource you want to limit.
          Other inputs stay unlimited, so list everything that constrains you.
          The planner and the tools below use the same caps and recipe toggles.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <CollapsibleSection
          variant="panel"
          title="Capped inputs"
          defaultOpen
          contentClassName="space-y-2"
        >
          {Object.keys(caps).length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => clearRawCaps()}
                className="min-h-9 touch-manipulation text-[11px] text-gray-500 hover:text-gray-300 sm:min-h-0"
              >
                Clear all
              </button>
            </div>
          )}

        {capEntries.length === 0 ? (
          <p className="rounded-md border border-dashed border-surface-border p-3 text-xs text-gray-500">
            No caps yet. Add at least one to bound &ldquo;max throughput&rdquo;
            and suggestions.
          </p>
        ) : (
          <ul className="space-y-2">
            {capEntries.map(([itemId, rate]) => {
              const it = getItem(itemId);
              if (!it) return null;
              return (
                <li
                  key={itemId}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-surface-border bg-surface p-2"
                >
                  <button
                    type="button"
                    onClick={() => onInspect(itemId)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={28} />
                    <span className="truncate text-sm font-medium">
                      {it.name}
                    </span>
                  </button>
                  <label className="flex items-center gap-1 text-xs text-gray-400">
                    <span className="sr-only">Max items per minute</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={Number.isFinite(rate) ? rate : 0}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setRawCap(itemId, v);
                      }}
                      className="input w-24 text-right num"
                    />
                    <span>/min</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setRawExcluded(itemId, true)}
                    className="rounded px-1.5 py-1 text-[11px] text-amber-200/90 hover:bg-surface-border hover:text-amber-100"
                    title="Exclude this raw input from planner sourcing"
                  >
                    Exclude
                  </button>
                  <button
                    type="button"
                    onClick={() => setRawCap(itemId, null)}
                    className="rounded p-1 text-gray-500 hover:bg-surface-border hover:text-gray-200"
                    aria-label={`Remove ${it.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {excludedEntries.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
            <p className="mb-2 text-xs text-amber-200/90">
              Excluded inputs (planner will not source these):
            </p>
            <ul className="space-y-1.5">
              {excludedEntries.map((itemId) => {
                const it = getItem(itemId);
                if (!it) return null;
                return (
                  <li
                    key={`excluded-${itemId}`}
                    className="flex items-center gap-2 rounded border border-amber-500/20 bg-surface p-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onInspect(itemId)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={22} />
                      <span className="truncate text-sm">{it.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRawExcluded(itemId, false)}
                      className="btn px-2 py-1 text-[11px]"
                    >
                      Include again
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {showAdd ? (
          <div className="mt-3 space-y-2 rounded-md border border-surface-border bg-surface p-2">
            <div className="flex items-center justify-between gap-2">
              <SearchInput
                label="Search raw resources"
                value={addQuery}
                onChange={setAddQuery}
                placeholder={
                  addMode === "cap"
                    ? "Coal, sulfur, oil…"
                    : "Pick an input to exclude…"
                }
                size="sm"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setAddQuery("");
                }}
                className="btn shrink-0 p-2"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="max-h-40 overflow-y-auto text-sm">
              {addHits.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => handlePickRaw(it.id)}
                    disabled={
                      addMode === "cap"
                        ? caps[it.id] !== undefined || excludedRawInputs.has(it.id)
                        : excludedRawInputs.has(it.id)
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-raised",
                      (addMode === "cap"
                        ? caps[it.id] !== undefined || excludedRawInputs.has(it.id)
                        : excludedRawInputs.has(it.id)) &&
                        "opacity-40",
                    )}
                  >
                    <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={22} />
                    <span className="truncate">{it.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setAddMode("cap");
                setShowAdd(true);
              }}
              className="btn min-h-10 w-full touch-manipulation justify-center gap-1.5 text-xs sm:min-h-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add raw budget
            </button>
            <button
              type="button"
              onClick={() => {
                setAddMode("exclude");
                setShowAdd(true);
              }}
              className="btn min-h-10 w-full touch-manipulation justify-center gap-1.5 text-xs sm:min-h-0"
              title="Add a raw input to excluded list"
            >
              <X className="h-3.5 w-3.5" />
              Exclude input
            </button>
          </div>
        )}
        </CollapsibleSection>

        <CollapsibleSection
          variant="panel"
          title="Target throughput"
          defaultOpen
          contentClassName="space-y-2"
        >
        <p className="flex items-start gap-2 text-xs text-gray-500">
          <LineChart
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500"
            aria-hidden
          />
          <span>
            Pick something you want to automate. See the maximum output/min your
            caps allow, what still counts as a missing input (recipe disabled),
            and what is pulling from uncapped raws.
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <SearchInput
              label="Item to analyze"
              value={analyzeQuery}
              onChange={(q) => {
                cancelAnalyzeCloseTimer();
                setAnalyzeQuery(q);
                setAnalyzeId(null);
                setAnalyzeDropdownOpen(q.trim().length > 0);
              }}
              onFocus={() => {
                cancelAnalyzeCloseTimer();
                if (analyzeQuery.trim().length > 0) setAnalyzeDropdownOpen(true);
              }}
              onBlur={() => {
                cancelAnalyzeCloseTimer();
                analyzeCloseTimer.current = setTimeout(() => {
                  setAnalyzeDropdownOpen(false);
                  analyzeCloseTimer.current = null;
                }, 150);
              }}
              placeholder="e.g. Turbofuel"
              size="sm"
            />
            {analyzeDropdownOpen && analyzeQuery.trim().length > 0 && (
              <ul
                role="listbox"
                aria-label="Matching items"
                className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-surface-border bg-surface-raised py-1 shadow-lg"
              >
                {analyzeHits.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={analyzeId === it.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      onClick={() => {
                        cancelAnalyzeCloseTimer();
                        setAnalyzeId(it.id);
                        setAnalyzeQuery(it.name);
                        setAnalyzeDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface"
                    >
                      <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={22} />
                      {it.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            disabled={!analyzeId || busy !== null}
            onClick={runAnalyze}
            className="btn min-h-10 shrink-0 touch-manipulation text-xs sm:min-h-0"
          >
            {busy === "analyze" ? "…" : "Calculate"}
          </button>
        </div>

        {insight && analyzeId && (
          <div className="mt-3 space-y-2 rounded-md border border-surface-border bg-surface p-3 text-sm">
            <div className="font-medium text-gray-200">
              {getItem(analyzeId)?.name}
            </div>
            {!insight.unbounded && insight.maxRate <= 1e-4 && (
              <p className="text-xs text-amber-200/90">
                Not producible with current recipe toggles and budgets (or caps
                are zero). Try enabling alternates or raising budgets.
              </p>
            )}
            {insight.unbounded ? (
              <p className="text-xs text-amber-200/90">
                Throughput is not bounded by your listed caps alone (other
                raws are still unlimited). Add caps for every raw in the chain,
                or treat this as &ldquo;no practical ceiling&rdquo; from these
                inputs.
              </p>
            ) : (
              <p className="text-xs text-gray-300">
                Max about{" "}
                <span className="num font-semibold text-brand">
                  {formatRate(insight.maxRate)}
                </span>{" "}
                /min from these budgets (single-output plan).
              </p>
            )}
            {insight.result && !insight.unbounded && onAddTargetAtRate && (
              <button
                type="button"
                className="btn text-xs"
                onClick={() => {
                  if (!analyzeId || insight.unbounded) return;
                  onAddTargetAtRate(analyzeId, insight.maxRate);
                }}
              >
                Add as production target at this rate
              </button>
            )}
            {insight.result?.missingInputs &&
              insight.result.missingInputs.length > 0 && (
                <div className="text-xs text-amber-200/90">
                  <span className="font-medium">Missing inputs: </span>
                  {insight.result.missingInputs.map((m, i) => (
                    <button
                      key={m.itemId}
                      type="button"
                      onClick={() => onInspect(m.itemId)}
                      className="inline text-brand hover:underline"
                    >
                      {getItem(m.itemId)?.name ?? m.itemId}
                      {i < insight.result!.missingInputs.length - 1 ? ", " : ""}
                    </button>
                  ))}
                  <span className="block mt-1 text-amber-200/70">
                    Enable a machine recipe for each (detail drawer) so the
                    solver does not treat them as free imports.
                  </span>
                </div>
              )}
          </div>
        )}
        </CollapsibleSection>

        <CollapsibleSection
          variant="panel"
          title="Suggestions"
          defaultOpen={false}
          contentClassName="space-y-2"
        >
        <p className="flex items-start gap-2 text-xs text-gray-500">
          <Lightbulb
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500"
            aria-hidden
          />
          <span>
            High–sink-value products you can route from your capped inputs (top
            candidates by score, then by max rate).
          </span>
        </p>
        <button
          type="button"
          disabled={Object.keys(caps).length === 0 || busy !== null}
          onClick={runSuggest}
          className="btn min-h-10 touch-manipulation text-xs sm:min-h-0"
        >
          {busy === "suggest" ? "Computing…" : "Suggest items to automate"}
        </button>
        <button
          type="button"
          disabled={
            Object.keys(caps).length === 0 ||
            config.targets.length === 0 ||
            busy !== null
          }
          onClick={runSuggestExcess}
          className="btn min-h-10 touch-manipulation text-xs sm:min-h-0"
          title={
            config.targets.length === 0
              ? "Add one or more production targets first"
              : "Find extra products that can use leftover capped input headroom"
          }
        >
          {busy === "excess"
            ? "Computing excess paths…"
            : "Suggest extras from remaining caps"}
        </button>
        {suggestions.length > 0 && (
          <>
            <ul className="mt-2 space-y-1.5 text-sm">
              {suggestions.map((s) => {
                const it = getItem(s.itemId);
                if (!it) return null;
                return (
                  <li key={s.itemId}>
                    <button
                      type="button"
                      onClick={() => onInspect(s.itemId)}
                      className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 rounded-md border border-surface-border bg-surface px-2 py-2 text-left hover:border-brand/50 sm:min-h-0 sm:py-1.5"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={24} />
                        <span className="truncate font-medium">{it.name}</span>
                      </span>
                      <span className="num shrink-0 text-xs text-gray-400">
                        {s.unbounded
                          ? "∞ /min"
                          : `${formatRate(s.maxRate)} /min`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="btn mt-3 w-full text-xs"
              onClick={() => {
                for (const s of suggestions.slice(0, 3)) {
                  const rate = s.unbounded ? 60 : s.maxRate;
                  if (rate > 0) upsertTarget(s.itemId, rate);
                }
              }}
            >
              Add top 3 as production targets
            </button>
          </>
        )}
        {excessSuggestions.length > 0 && (
          <>
            <p className="mt-3 text-xs text-gray-500">
              Extras that can be added while preserving your current targets:
            </p>
            <ul className="space-y-1.5 text-sm">
              {excessSuggestions.map((s) => {
                const it = getItem(s.itemId);
                if (!it) return null;
                return (
                  <li key={`excess-${s.itemId}`}>
                    <button
                      type="button"
                      onClick={() => onInspect(s.itemId)}
                      className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 rounded-md border border-surface-border bg-surface px-2 py-2 text-left hover:border-brand/50 sm:min-h-0 sm:py-1.5"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={24} />
                        <span className="truncate font-medium">{it.name}</span>
                      </span>
                      <span className="num shrink-0 text-xs text-gray-400">
                        +{formatRate(s.maxAdditionalRate)} /min
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="btn mt-2 w-full text-xs"
              onClick={() => {
                for (const s of excessSuggestions.slice(0, 3)) {
                  if (s.maxAdditionalRate <= 0) continue;
                  const existingRate =
                    config.targets.find((t) => t.itemId === s.itemId)?.rate ?? 0;
                  upsertTarget(s.itemId, existingRate + s.maxAdditionalRate);
                }
              }}
            >
              Add top 3 extras from remaining caps
            </button>
          </>
        )}
        {busy !== "excess" && excessStatus && (
          <p className="mt-2 text-xs text-amber-200/90">{excessStatus}</p>
        )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
