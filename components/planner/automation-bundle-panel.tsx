"use client";

import Fuse from "fuse.js";
import { Layers, Sparkles, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ItemIcon } from "@/components/item-icon";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SearchInput } from "@/components/ui/search-input";
import { allItems, getItem } from "@/lib/data";
import {
  oneMachineLayerRates,
  suggestBundleTargetRates,
} from "@/lib/planner/bundle-insight";
import type { PlannerConfig } from "@/lib/planner/types";
import { usePlannerStore } from "@/lib/store/planner-store";
import { cn, formatRate } from "@/lib/utils";

interface AutomationBundlePanelProps {
  config: PlannerConfig;
  onInspect: (itemId: string) => void;
}

export function AutomationBundlePanel({
  config,
  onInspect,
}: AutomationBundlePanelProps) {
  const upsertTarget = usePlannerStore((s) => s.upsertTarget);

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

  const [draftIds, setDraftIds] = useState<string[]>([]);

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

  const handleOneMachineEach = useCallback(() => {
    if (draftIds.length === 0) return;
    applyRates(oneMachineLayerRates(config, draftIds));
  }, [applyRates, config, draftIds]);

  const handleMaxUnderCaps = useCallback(() => {
    if (draftIds.length === 0) return;
    const suggestion = suggestBundleTargetRates(config, draftIds);
    applyRates(suggestion.rates);
  }, [applyRates, config, draftIds]);

  const hasCaps =
    config.rawCaps !== undefined && Object.keys(config.rawCaps).length > 0;

  const preview = useMemo(() => {
    if (draftIds.length === 0) return null;
    return suggestBundleTargetRates(config, draftIds);
  }, [config, draftIds]);

  return (
    <div className="card flex flex-col gap-3 p-3 sm:gap-4 sm:p-4">
      <header>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Multi-item automation
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Pick several end products (for example Radio Control Unit and Crystal
          Oscillator). Apply starter rates from one machine each, or scale the
          whole bundle to fit your raw budgets. Then tweak numbers in Targets;
          raw inputs and recipes update automatically.
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

        {preview && draftIds.length > 0 && (
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
            {preview.scale <= 0 && draftIds.length > 0 && (
              <p className="mt-2 text-red-300/90">
                This combination is not feasible with current recipe toggles and
                caps. Enable recipes or raise budgets.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={draftIds.length === 0}
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
        </div>
      </CollapsibleSection>
    </div>
  );
}
