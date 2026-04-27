"use client";

import Fuse from "fuse.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { ItemCard } from "@/components/catalog/item-card";
import {
  SearchInput,
  type SearchInputHandle,
} from "@/components/ui/search-input";
import { allItems, itemCategories } from "@/lib/data";
import { cn } from "@/lib/utils";

interface CatalogPanelProps {
  selectedItemId?: string;
  /** When set, items not in this set are dimmed and cannot be added as targets. */
  hubProducibleItemIds?: Set<string> | null;
  /** True while feasibility is computed for hub-tier dimming (avoid false locks). */
  hubTierScanPending?: boolean;
  onSelect: (itemId: string) => void;
  onAddTarget: (itemId: string) => void;
}

export function CatalogPanel({
  selectedItemId,
  hubProducibleItemIds = null,
  hubTierScanPending = false,
  onSelect,
  onAddTarget,
}: CatalogPanelProps) {
  const items = useMemo(() => allItems(), []);
  const categories = useMemo(() => ["All", ...itemCategories()], []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const searchRef = useRef<SearchInputHandle>(null);

  // Press "/" anywhere to focus catalog search (unless already typing).
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: ["name", "slug", "description", "category"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [items],
  );

  const filtered = useMemo(() => {
    const base =
      category === "All"
        ? items
        : items.filter((it) => it.category === category);
    if (!query.trim()) {
      return [...base].sort((a, b) => a.name.localeCompare(b.name));
    }
    const hits = fuse.search(query).map((h) => h.item);
    return hits.filter(
      (it) => category === "All" || it.category === category,
    );
  }, [items, fuse, query, category]);

  return (
    <aside className="relative z-10 flex h-full flex-col border-r border-surface-border bg-surface-raised">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          Catalog
        </div>
        <div className="num text-xs text-gray-500">
          {filtered.length} / {items.length}
        </div>
      </div>
      {hubTierScanPending && (
        <p className="mx-3 mb-2 rounded-md border border-brand/20 bg-brand/5 px-2 py-1.5 text-[11px] leading-snug text-gray-400">
          Checking hub-tier reachability for the item list…
        </p>
      )}
      <div className="px-3 pb-2">
        <SearchInput
          ref={searchRef}
          value={query}
          onChange={setQuery}
          label="Search catalog"
          placeholder="Search items..."
          hint="/"
        />
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-surface-border px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "shrink-0 touch-manipulation rounded-md border px-2.5 py-1.5 text-xs transition sm:py-0.5",
              category === c
                ? "border-brand bg-brand/15 text-brand"
                : "border-surface-border text-gray-400 hover:border-gray-500 hover:text-gray-200",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-1.5 overflow-y-auto p-2">
        {filtered.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            active={selectedItemId === item.id}
            lockedByProgress={
              !hubTierScanPending &&
              hubProducibleItemIds != null &&
              !hubProducibleItemIds.has(item.id)
            }
            onSelect={onSelect}
            onAddTarget={onAddTarget}
          />
        ))}
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-500">
            No items match your search.
          </div>
        )}
      </div>
      <div className="border-t border-surface-border px-3 py-2 text-[11px] text-gray-500">
        Tap row for details ·{" "}
        <span className="hidden sm:inline">Double-click row or </span>
        use + to add a target
      </div>
    </aside>
  );
}
