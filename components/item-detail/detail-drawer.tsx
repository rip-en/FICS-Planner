"use client";

import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Plus,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/components/item-icon";
import { RecipeCard } from "@/components/item-detail/recipe-card";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { getItem, recipesConsuming, recipesProducing } from "@/lib/data";
import { cn } from "@/lib/utils";

function DrawerUnknownItem({
  itemId,
  onClose,
}: {
  itemId: string;
  onClose: () => void;
}) {
  return (
    <aside className="flex h-full min-w-0 flex-col overflow-x-hidden border-l border-surface-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Details
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-gray-400 transition hover:bg-surface hover:text-gray-100"
          aria-label="Close detail drawer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <p className="text-sm text-amber-200/90">
          This item is not in the current game data ({itemId}). It may come from
          an old imported plan or a removed mod item.
        </p>
        <button type="button" onClick={onClose} className="btn mt-4">
          Close
        </button>
      </div>
    </aside>
  );
}

function DrawerWelcome() {
  return (
    <aside className="flex h-full min-w-0 flex-col overflow-x-hidden border-l border-surface-border bg-surface-raised">
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-2">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Details
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand/15 text-brand">
          <BookOpen className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-base font-semibold">Item details</h3>
        <p className="mt-1 text-sm text-gray-400">
          Click any item in the catalog to see its recipes, alternates, and
          everywhere it&apos;s used — without leaving this page.
        </p>
        <ul className="mt-4 space-y-2 text-xs text-gray-500">
          <li className="flex items-center gap-2">
            <kbd className="rounded border border-surface-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
              /
            </kbd>
            Focus the catalog search
          </li>
          <li className="flex items-center gap-2">
            <span className="rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] text-gray-300">
              Click
            </span>
            Open item details here
          </li>
          <li className="flex items-center gap-2">
            <span className="rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[10px] text-gray-300">
              +
            </span>
            In the catalog, use the + button (or double-click a row) to add a
            target
          </li>
          <li className="flex items-center gap-2">
            <Search className="h-3 w-3" />
            Use the source filter tabs to find MAM/Hard Drive alternates
          </li>
        </ul>
      </div>
    </aside>
  );
}

interface DetailDrawerProps {
  itemId?: string;
  historyLength: number;
  enabledAlternates: string[];
  disabledRecipes: string[];
  recipesInUse: string[];
  onBack: () => void;
  onClose: () => void;
  onSelect: (itemId: string) => void;
  onAddTarget: (itemId: string) => void;
  onToggleAlternate: (recipeId: string) => void;
  onToggleDisabled: (recipeId: string) => void;
  onUseOnlyThis: (recipeId: string) => void;
  providedInputs: string[];
  onToggleProvidedInput: (itemId: string, provided: boolean) => void;
  /** When hub tier gating makes this item unplannable as a target. */
  addTargetBlockedByHub?: boolean;
}

export function DetailDrawer({
  itemId,
  historyLength,
  enabledAlternates,
  disabledRecipes,
  recipesInUse,
  onBack,
  onClose,
  onSelect,
  onAddTarget,
  onToggleAlternate,
  onToggleDisabled,
  onUseOnlyThis,
  providedInputs,
  onToggleProvidedInput,
  addTargetBlockedByHub = false,
}: DetailDrawerProps) {
  const item = itemId ? getItem(itemId) : undefined;
  const missingItem = Boolean(itemId && !item);
  const enabledSet = useMemo(
    () => new Set(enabledAlternates),
    [enabledAlternates],
  );
  const disabledSet = useMemo(
    () => new Set(disabledRecipes),
    [disabledRecipes],
  );
  const inUseSet = useMemo(() => new Set(recipesInUse), [recipesInUse]);
  const providedInputSet = useMemo(
    () => new Set(providedInputs),
    [providedInputs],
  );
  const [previewProductionPercentByRecipeId, setPreviewProductionPercentByRecipeId] =
    useState<Record<string, number>>({});

  useEffect(() => {
    setPreviewProductionPercentByRecipeId({});
  }, [itemId]);

  const { producers, alternates, consumers, producerCount } = useMemo(() => {
    if (!itemId)
      return {
        producers: [],
        alternates: [],
        consumers: [],
        producerCount: 0,
      };
    const produced = recipesProducing(itemId);
    return {
      producers: produced.filter((r) => !r.alternate),
      alternates: produced.filter((r) => r.alternate),
      consumers: recipesConsuming(itemId),
      producerCount: produced.length,
    };
  }, [itemId]);
  const hasCompetitors = producerCount > 1;

  if (missingItem && itemId) {
    return <DrawerUnknownItem itemId={itemId} onClose={onClose} />;
  }
  if (!item) return <DrawerWelcome />;

  return (
    <aside className="flex h-full min-w-0 flex-col overflow-x-hidden border-l border-surface-border bg-surface-raised">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={historyLength <= 1}
            className={cn(
              "rounded-md p-1.5 text-gray-400 transition hover:bg-surface hover:text-gray-100 disabled:opacity-40",
            )}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Details
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-gray-400 transition hover:bg-surface hover:text-gray-100"
          aria-label="Close detail drawer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <header className="border-b border-surface-border p-4">
          <div className="flex items-start gap-3">
            <ItemIcon iconUrl={item.iconUrl} alt={item.name} size={64} />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">{item.name}</h2>
              <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">
                {item.category} · {item.form}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm text-gray-300">
                {item.description || "—"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-300">
            <span className="chip">Stack: {item.stackSize}</span>
            <span className="chip">Sink: {item.sinkPoints}</span>
            {item.energyValue > 0 && (
              <span className="chip">Energy: {item.energyValue} MJ</span>
            )}
            {item.radioactiveDecay > 0 && (
              <span className="chip border-red-500/50 text-red-300">
                Radioactive
              </span>
            )}
            {item.isRaw && (
              <span className="chip border-green-500/50 text-green-300">
                Raw Resource
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={addTargetBlockedByHub}
              onClick={() => onAddTarget(item.id)}
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              title={
                addTargetBlockedByHub
                  ? "Raise the completed hub tier in the toolbar to plan this item"
                  : undefined
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add to planner
            </button>
            <Link href={`/items/${item.slug}`} className="btn">
              <ExternalLink className="h-3.5 w-3.5" />
              Open page
            </Link>
            </div>
            {addTargetBlockedByHub && (
              <p className="text-xs text-amber-200/90">
                This item is not reachable at your selected hub tier— increase
                &quot;Hub tier done&quot; in the plan toolbar, or turn off
                milestone gating.
              </p>
            )}
          </div>
        </header>

        <CollapsibleSection
          title={`Recipes · ${producers.length}`}
          className="border-b border-surface-border p-4"
          contentClassName="space-y-2"
        >
          {producers.length === 0 ? (
            <p className="text-sm text-gray-500">No standard recipe.</p>
          ) : (
            producers.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                onItemClick={onSelect}
                onToggleDisabled={onToggleDisabled}
                onUseOnlyThis={onUseOnlyThis}
                disabled={disabledSet.has(r.id)}
                inUse={inUseSet.has(r.id)}
                hasCompetitors={hasCompetitors}
                providedInputSet={providedInputSet}
                onToggleProvidedInput={onToggleProvidedInput}
              />
            ))
          )}
        </CollapsibleSection>

        {alternates.length > 0 && (
          <CollapsibleSection
            title={`Alternate recipes · ${alternates.length}`}
            className="border-b border-surface-border p-4"
            contentClassName="space-y-2"
          >
            <p className="mb-2 text-[11px] text-gray-500">
              Enable an alternate so the planner can choose it. If the solver
              still picks the standard recipe, hit{" "}
              <span className="text-gray-300">Use only this</span> to force it,
              or <span className="text-gray-300">Disable</span> the competing
              recipe.
            </p>
            {alternates.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                onItemClick={onSelect}
                onToggleAlternate={onToggleAlternate}
                onToggleDisabled={onToggleDisabled}
                onUseOnlyThis={onUseOnlyThis}
                enabled={enabledSet.has(r.id)}
                disabled={disabledSet.has(r.id)}
                inUse={inUseSet.has(r.id)}
                hasCompetitors={hasCompetitors}
                providedInputSet={providedInputSet}
                onToggleProvidedInput={onToggleProvidedInput}
                productionPercent={
                  previewProductionPercentByRecipeId[r.id] ?? 100
                }
                onSetProductionPercent={(percent) => {
                  const boundedPercent = Math.min(300, Math.max(10, percent));
                  setPreviewProductionPercentByRecipeId((prev) => ({
                    ...prev,
                    [r.id]: boundedPercent,
                  }));
                }}
              />
            ))}
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title={`Used to craft · ${consumers.length}`}
          className="border-b border-surface-border p-4"
          contentClassName="space-y-2"
        >
          {consumers.length === 0 ? (
            <p className="text-sm text-gray-500">
              Not used as an ingredient.
            </p>
          ) : (
            <div className="space-y-2">
              {consumers.map((r) => {
                const firstProductId = r.products[0]?.item;
                const recipeHasCompetitors = firstProductId
                  ? recipesProducing(firstProductId).length > 1
                  : false;
                return (
                  <RecipeCard
                    key={r.id}
                    recipe={r}
                    emphasizeItemId={item.id}
                    onItemClick={onSelect}
                    onToggleAlternate={r.alternate ? onToggleAlternate : undefined}
                    onToggleDisabled={onToggleDisabled}
                    onUseOnlyThis={onUseOnlyThis}
                    enabled={r.alternate ? enabledSet.has(r.id) : undefined}
                    disabled={disabledSet.has(r.id)}
                    inUse={inUseSet.has(r.id)}
                    hasCompetitors={recipeHasCompetitors}
                    providedInputSet={providedInputSet}
                    onToggleProvidedInput={onToggleProvidedInput}
                    productionPercent={
                      r.alternate
                        ? (previewProductionPercentByRecipeId[r.id] ?? 100)
                        : undefined
                    }
                    onSetProductionPercent={
                      r.alternate
                        ? (percent) => {
                            const boundedPercent = Math.min(
                              300,
                              Math.max(10, percent),
                            );
                            setPreviewProductionPercentByRecipeId((prev) => ({
                              ...prev,
                              [r.id]: boundedPercent,
                            }));
                          }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </aside>
  );
}
