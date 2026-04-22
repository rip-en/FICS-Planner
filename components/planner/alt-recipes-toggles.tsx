"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { knownAlternates } from "@/lib/planner/solver";
import { usePlannerStore } from "@/lib/store/planner-store";
import { getBuilding, getItem } from "@/lib/data";
import { ItemIcon } from "@/components/item-icon";
import { SourceBadge } from "@/components/item-detail/recipe-card";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import type { RecipeUnlockSource } from "@/types/game";

interface AltRecipeTogglesProps {
  enabled: string[];
  recipesInUse: string[];
}

type SourceFilter = "all" | RecipeUnlockSource;

const SOURCE_CHOICES: Array<{ id: SourceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "hard-drive", label: "Hard Drive" },
  { id: "mam", label: "MAM" },
  { id: "milestone", label: "Milestone" },
];

export function AltRecipeToggles({
  enabled,
  recipesInUse,
}: AltRecipeTogglesProps) {
  const toggle = usePlannerStore((s) => s.toggleAlternate);
  const enableAllAlternates = usePlannerStore((s) => s.enableAllAlternates);
  const disableAllAlternates = usePlannerStore((s) => s.disableAllAlternates);
  const recipes = useMemo(() => knownAlternates(), []);
  const [query, setQuery] = useState("");
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  const [source, setSource] = useState<SourceFilter>("all");
  const [bodyOpen, setBodyOpen] = useState(true);

  const enabledSet = useMemo(() => new Set(enabled), [enabled]);
  const inUseSet = useMemo(() => new Set(recipesInUse), [recipesInUse]);

  const fuse = useMemo(
    () =>
      new Fuse(recipes, {
        keys: ["name", "products.item", "ingredients.item"],
        threshold: 0.35,
      }),
    [recipes],
  );

  const filtered = useMemo(() => {
    let base = recipes;
    if (onlyEnabled) base = base.filter((r) => enabledSet.has(r.id));
    if (source !== "all")
      base = base.filter((r) => r.unlockedBy.source === source);
    if (!query.trim()) return base;
    const ids = new Set(fuse.search(query).map((h) => h.item.id));
    return base.filter((r) => ids.has(r.id));
  }, [recipes, fuse, query, onlyEnabled, source, enabledSet]);

  const counts = useMemo(() => {
    const c: Record<SourceFilter, number> = {
      all: recipes.length,
      mam: 0,
      "hard-drive": 0,
      milestone: 0,
      initial: 0,
      other: 0,
    };
    for (const r of recipes) c[r.unlockedBy.source] += 1;
    return c;
  }, [recipes]);

  const allAlternatesEnabled =
    recipes.length > 0 && recipes.every((r) => enabledSet.has(r.id));

  return (
    <div className="card relative overflow-hidden">
      <div className="belt absolute inset-x-0 top-0" aria-hidden />
      <button
        type="button"
        id="alt-recipes-toggle"
        aria-expanded={bodyOpen}
        aria-controls="alt-recipes-body"
        onClick={() => setBodyOpen((o) => !o)}
        className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 border-b border-surface-border px-3 py-2 text-left sm:min-h-0"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span className="shrink-0">Alternate recipes</span>
            <span className="font-normal normal-case tracking-normal text-gray-500">
              <span className="num">{enabled.length}</span> enabled ·{" "}
              <span className="num">{inUseSet.size}</span> in use
            </span>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-gray-500 transition-transform",
            bodyOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {bodyOpen && (
        <div id="alt-recipes-body" role="region" aria-labelledby="alt-recipes-toggle">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => enableAllAlternates()}
                disabled={recipes.length === 0 || allAlternatesEnabled}
                className="btn text-xs disabled:pointer-events-none disabled:opacity-40"
                title="Enable every alternate recipe for the solver"
              >
                Enable all
              </button>
              <button
                type="button"
                onClick={() => disableAllAlternates()}
                disabled={enabled.length === 0}
                className="btn text-xs disabled:pointer-events-none disabled:opacity-40"
                title="Disable every alternate recipe for the solver"
              >
                Disable all
              </button>
            </div>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-gray-400 touch-manipulation">
              <input
                type="checkbox"
                checked={onlyEnabled}
                onChange={(e) => setOnlyEnabled(e.target.checked)}
                className="accent-brand"
              />
              Only enabled
            </label>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-surface-border px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SOURCE_CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSource(c.id)}
                className={cn(
                  "shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition touch-manipulation",
                  source === c.id
                    ? "border-brand bg-brand/15 text-brand"
                    : "border-surface-border text-gray-400 hover:border-gray-500 hover:text-gray-200",
                )}
              >
                {c.label}
                <span className="ml-1 text-gray-500">
                  {counts[c.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
          <div className="px-3 pb-2 pt-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              label="Search alternate recipes"
              placeholder="Search alternates..."
            />
          </div>
          <ul className="max-h-[min(24rem,55vh)] overflow-y-auto overscroll-contain sm:max-h-96">
            {filtered.map((r) => {
              const active = enabledSet.has(r.id);
              const inUse = inUseSet.has(r.id);
              const building = getBuilding(r.producedIn[0] ?? "");
              return (
                <li
                  key={r.id}
                  className={cn(
                    "flex flex-col gap-1 border-t border-surface-border px-3 py-2 text-sm sm:flex-row sm:items-center sm:py-1.5",
                    active && "bg-brand/5",
                    inUse && "ring-1 ring-inset ring-brand/40",
                  )}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 sm:items-center">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggle(r.id)}
                      className="accent-brand mt-0.5 sm:mt-0"
                    />
                    <div className="flex shrink-0 items-center gap-1.5">
                      {r.products.slice(0, 2).map((p) => {
                        const it = getItem(p.item);
                        return it ? (
                          <ItemIcon
                            key={p.item}
                            iconUrl={it.iconUrl}
                            alt={it.name}
                            size={22}
                          />
                        ) : null;
                      })}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-medium leading-snug text-gray-200">
                        {r.name}
                      </div>
                      {building && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500 sm:hidden">
                          <span>{building.name}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:contents">
                      <SourceBadge source={r.unlockedBy.source} />
                      {inUse && (
                        <span className="chip border-green-500/50 bg-green-500/10 text-green-300">
                          <span className="pulse-dot" />
                          In use
                        </span>
                      )}
                    </div>
                  </label>
                  {building && (
                    <span className="hidden pl-7 text-[11px] text-gray-500 sm:inline sm:pl-0">
                      {building.name}
                    </span>
                  )}
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-gray-500">
                No alternate recipes match.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
