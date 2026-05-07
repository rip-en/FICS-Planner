"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import { allItems, getItem } from "@/lib/data";
import type { PlannerConfig } from "@/lib/planner/types";
import { usePlannerStore } from "@/lib/store/planner-store";
import { ItemIcon } from "@/components/item-icon";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";

interface ExternalSupplyPanelProps {
  config: PlannerConfig;
  onInspect: (itemId: string) => void;
  /**
   * Increment when this panel is shown again from the Sections menu while the
   * card body was collapsed — re-opens the body.
   */
  expandPanelRevision?: number;
}

export function ExternalSupplyPanel({
  config,
  onInspect,
  expandPanelRevision,
}: ExternalSupplyPanelProps) {
  const setProvidedInput = usePlannerStore((s) => s.setProvidedInput);
  const setProvidedInputCap = usePlannerStore((s) => s.setProvidedInputCap);

  const [bodyOpen, setBodyOpen] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (expandPanelRevision === undefined) return;
    if (expandPanelRevision > 0) setBodyOpen(true);
  }, [expandPanelRevision]);
  const [addQuery, setAddQuery] = useState("");
  const [addMode, setAddMode] = useState<"partial" | "unlimited">("partial");

  const caps = config.providedInputCaps ?? {};
  const unlimitedSet = useMemo(
    () => new Set(config.providedInputs ?? []),
    [config.providedInputs],
  );

  const fuse = useMemo(
    () =>
      new Fuse(allItems(), {
        keys: ["name", "slug"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [],
  );

  const addHits = useMemo(() => {
    const q = addQuery.trim();
    if (!q) return allItems().slice(0, 12);
    return fuse.search(q).map((h) => h.item).slice(0, 12);
  }, [addQuery, fuse]);

  const capEntries = useMemo(
    () =>
      Object.entries(caps)
        .filter(([, rate]) => Number.isFinite(rate) && rate > 0)
        .sort((a, b) =>
          (getItem(a[0])?.name ?? a[0]).localeCompare(getItem(b[0])?.name ?? b[0]),
        ),
    [caps],
  );

  const unlimitedEntries = useMemo(
    () =>
      [...unlimitedSet].sort((a, b) =>
        (getItem(a)?.name ?? a).localeCompare(getItem(b)?.name ?? b),
      ),
    [unlimitedSet],
  );

  const rowCount = capEntries.length + unlimitedEntries.length;

  const handlePickAdd = (itemId: string) => {
    if (caps[itemId] !== undefined && caps[itemId]! > 0) return;
    if (unlimitedSet.has(itemId)) return;
    if (addMode === "unlimited") {
      setProvidedInput(itemId, true);
    } else {
      setProvidedInputCap(itemId, 60);
    }
    setAddQuery("");
    setShowAdd(false);
  };

  return (
    <div className="card relative overflow-hidden">
      <div className="belt absolute inset-x-0 top-0" aria-hidden />
      <button
        type="button"
        id="external-supply-panel-toggle"
        aria-expanded={bodyOpen}
        aria-controls="external-supply-panel-body"
        onClick={() => setBodyOpen((o) => !o)}
        className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 border-b border-surface-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-400 sm:min-h-0"
      >
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
            External supply / omit
          </span>
          <span className="hidden font-normal normal-case tracking-normal text-gray-500 sm:inline">
            Already-built rates or unlimited omit
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="num font-normal text-gray-500">{rowCount}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-500 transition-transform",
              bodyOpen && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </button>

      {bodyOpen && (
        <div
          id="external-supply-panel-body"
          role="region"
          aria-labelledby="external-supply-panel-toggle"
          className="space-y-3 px-3 py-3"
        >
          <p className="text-[11px] leading-relaxed text-gray-500">
            Tell the planner how much of an intermediate or raw you already supply from
            another factory. It will only build the remainder here. Use{" "}
            <span className="text-gray-400">partial</span> for a max rate from outside, or{" "}
            <span className="text-gray-400">unlimited</span> to treat the whole need as
            covered (same as the recipe “Omit” checkbox).
          </p>

          {capEntries.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Partial (max external rate)
              </p>
              <ul className="divide-y divide-surface-border rounded-md border border-surface-border">
                {capEntries.map(([itemId, rate]) => {
                  const it = getItem(itemId);
                  if (!it) return null;
                  return (
                    <li
                      key={`cap-${itemId}`}
                      className="flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center"
                    >
                      <button
                        type="button"
                        onClick={() => onInspect(itemId)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-brand"
                      >
                        <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={28} />
                        <span className="truncate text-sm font-medium">{it.name}</span>
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={rate}
                          onChange={(e) =>
                            setProvidedInputCap(itemId, Number(e.target.value))
                          }
                          className="input num min-h-9 w-28 text-right sm:min-h-0"
                          aria-label={`External supply for ${it.name}`}
                        />
                        <span className="text-xs text-gray-500">/min</span>
                        <button
                          type="button"
                          className="btn min-h-9 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-200 sm:min-h-0"
                          onClick={() => setProvidedInput(itemId, true)}
                          title="Treat entire shortfall as externally supplied"
                        >
                          All external
                        </button>
                        <button
                          type="button"
                          className="btn min-h-9 px-2 py-1 text-red-300 hover:text-red-200 sm:min-h-0"
                          onClick={() => setProvidedInputCap(itemId, null)}
                          aria-label={`Remove ${it.name} from external supply`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {unlimitedEntries.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Unlimited omit
              </p>
              <ul className="divide-y divide-surface-border rounded-md border border-surface-border">
                {unlimitedEntries.map((itemId) => {
                  const it = getItem(itemId);
                  if (!it) return null;
                  return (
                    <li
                      key={`unl-${itemId}`}
                      className="flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center"
                    >
                      <button
                        type="button"
                        onClick={() => onInspect(itemId)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-brand"
                      >
                        <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={28} />
                        <div className="min-w-0 text-left">
                          <div className="truncate text-sm font-medium">{it.name}</div>
                          <div className="text-[11px] text-gray-500">
                            Entire amount treated as supplied from outside
                          </div>
                        </div>
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        <button
                          type="button"
                          className="btn min-h-9 px-2 py-1 text-[11px] sm:min-h-0"
                          onClick={() => {
                            setProvidedInput(itemId, false);
                            setProvidedInputCap(itemId, 60);
                          }}
                        >
                          Use partial…
                        </button>
                        <button
                          type="button"
                          className="btn min-h-9 px-2 py-1 text-red-300 hover:text-red-200 sm:min-h-0"
                          onClick={() => setProvidedInput(itemId, false)}
                          aria-label={`Stop omitting ${it.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {rowCount === 0 && !showAdd && (
            <p className="rounded-md border border-dashed border-surface-border px-3 py-4 text-center text-xs text-gray-500">
              No external supply yet. Add an item to omit part or all of its production.
            </p>
          )}

          {showAdd ? (
            <div className="space-y-2 rounded-md border border-surface-border bg-surface p-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(
                    "btn px-2 py-1 text-[11px]",
                    addMode === "partial" && "border-brand/60 bg-brand/10 text-brand",
                  )}
                  onClick={() => setAddMode("partial")}
                >
                  Partial rate
                </button>
                <button
                  type="button"
                  className={cn(
                    "btn px-2 py-1 text-[11px]",
                    addMode === "unlimited" && "border-brand/60 bg-brand/10 text-brand",
                  )}
                  onClick={() => setAddMode("unlimited")}
                >
                  Unlimited omit
                </button>
              </div>
              <div className="flex items-center gap-2">
                <SearchInput
                  label="Add item"
                  value={addQuery}
                  onChange={setAddQuery}
                  placeholder="Search items…"
                  size="sm"
                  className="flex-1"
                />
                <button
                  type="button"
                  className="btn shrink-0 p-2"
                  onClick={() => {
                    setShowAdd(false);
                    setAddQuery("");
                  }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <ul className="max-h-40 overflow-y-auto text-sm">
                {addHits.map((item) => {
                  const blocked =
                    (caps[item.id] !== undefined && caps[item.id]! > 0) ||
                    unlimitedSet.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={blocked}
                        onClick={() => handlePickAdd(item.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-raised",
                          blocked && "opacity-40",
                        )}
                      >
                        <ItemIcon iconUrl={item.iconUrl} alt={item.name} size={22} />
                        <span className="truncate">{item.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <button
              type="button"
              className="btn flex min-h-10 w-full touch-manipulation items-center justify-center gap-1.5 text-xs sm:min-h-0"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add external supply
            </button>
          )}
        </div>
      )}
    </div>
  );
}
