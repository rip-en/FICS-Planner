"use client";

import {
  ArrowDown,
  ArrowRight,
  Ban,
  Check,
  CircleSlash,
  Plus,
  Target,
} from "lucide-react";
import { getBuilding, getItem } from "@/lib/data";
import { cn, formatRate } from "@/lib/utils";
import { ItemIcon } from "@/components/item-icon";
import type { Recipe, RecipeIngredient, RecipeUnlockSource } from "@/types/game";

interface RecipeCardProps {
  recipe: Recipe;
  onItemClick?: (itemId: string) => void;
  /** Toggle the enabled-alternates list; only meaningful for alternates. */
  onToggleAlternate?: (recipeId: string) => void;
  /** Toggle the recipe on the disabled list (works for any recipe). */
  onToggleDisabled?: (recipeId: string) => void;
  /** Lock an item to this recipe by disabling every competing producer. */
  onUseOnlyThis?: (recipeId: string) => void;
  /** Whether this alternate is currently enabled for the planner. */
  enabled?: boolean;
  /** Whether this recipe is currently disabled for the planner. */
  disabled?: boolean;
  /** Whether the solver is actively using this recipe in the current plan. */
  inUse?: boolean;
  /** True when >=2 recipes produce the same primary product; unlocks the
   * "use only this" button. */
  hasCompetitors?: boolean;
  /** Items treated as externally provided in this planner config. */
  providedInputSet?: Set<string>;
  /** Toggle an ingredient as externally provided for this plan. */
  onToggleProvidedInput?: (itemId: string, provided: boolean) => void;
  /** Optional alternate production percentage (100 = default). */
  productionPercent?: number;
  /** Set alternate production percentage. */
  onSetProductionPercent?: (percent: number) => void;
  /** When set, the ingredient row for this item is visually emphasized. */
  emphasizeItemId?: string;
}

const SOURCE_LABELS: Record<RecipeUnlockSource, string> = {
  mam: "MAM",
  "hard-drive": "Hard Drive",
  milestone: "Milestone",
  initial: "Starter",
  other: "Other",
};

const SOURCE_STYLES: Record<RecipeUnlockSource, string> = {
  mam: "border-emerald-500/50 text-emerald-300 bg-emerald-500/10",
  "hard-drive": "border-sky-500/50 text-sky-300 bg-sky-500/10",
  milestone: "border-indigo-500/50 text-indigo-300 bg-indigo-500/10",
  initial: "border-surface-border text-gray-400",
  other: "border-surface-border text-gray-400",
};

export function SourceBadge({ source }: { source: RecipeUnlockSource }) {
  if (source === "initial" || source === "other") return null;
  return (
    <span className={cn("chip", SOURCE_STYLES[source])}>
      {SOURCE_LABELS[source]}
    </span>
  );
}

function StatusChip({
  disabled,
  enabled,
  alternate,
  inUse,
}: {
  disabled?: boolean;
  enabled?: boolean;
  alternate: boolean;
  inUse?: boolean;
}) {
  if (disabled) {
    return (
      <span className="chip border-red-500/50 text-red-300">
        <Ban className="h-3 w-3" />
        Disabled
      </span>
    );
  }
  if (inUse) {
    return (
      <span className="chip border-green-500/50 bg-green-500/10 text-green-300">
        <span className="pulse-dot" />
        In use
      </span>
    );
  }
  if (alternate && enabled) {
    return (
      <span
        className="chip border-amber-500/50 text-amber-300"
        title="This alternate is enabled but the solver picked a cheaper path. Disable the competing standard recipe, or click 'Use only this' to force it."
      >
        <CircleSlash className="h-3 w-3" />
        Enabled · not chosen
      </span>
    );
  }
  return null;
}

function IngredientRow({
  ing,
  onItemClick,
  isProvided,
  onToggleProvided,
  rateMultiplier = 1,
  rowLabel,
  emphasized,
}: {
  ing: RecipeIngredient;
  onItemClick?: (itemId: string) => void;
  isProvided?: boolean;
  onToggleProvided?: (itemId: string, provided: boolean) => void;
  rateMultiplier?: number;
  rowLabel?: string;
  emphasized?: boolean;
}) {
  const item = getItem(ing.item);
  if (!item) return null;
  return (
    <div
      className={cn(
        "flex w-full min-w-0 overflow-hidden rounded-md border",
        emphasized
          ? "border-brand/50 ring-1 ring-brand/30"
          : "border-surface-border",
      )}
    >
      <button
        type="button"
        onClick={() => onItemClick?.(item.id)}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left transition hover:bg-surface-raised/80"
      >
        <ItemIcon
          className="shrink-0"
          iconUrl={item.iconUrl}
          alt={item.name}
          size={24}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium" title={item.name}>
            {ing.amount}x {item.name}
          </div>
          <div className="truncate text-[11px] text-gray-500">
            {formatRate(ing.ratePerMin * rateMultiplier)} /min
          </div>
        </div>
      </button>
      {onToggleProvided && (
        <label
          className={cn(
            "flex w-[2.75rem] shrink-0 cursor-pointer select-none flex-col items-center justify-center gap-0.5 border-l px-1.5 py-1.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide sm:w-[3rem] sm:px-2",
            isProvided
              ? "border-brand/35 bg-brand/10 text-brand"
              : "border-surface-border bg-surface-raised/50 text-gray-500 hover:bg-surface-raised",
          )}
          title="Treat as already supplied (omit from the build)"
        >
          <input
            type="checkbox"
            checked={Boolean(isProvided)}
            onChange={(event) => onToggleProvided(item.id, event.target.checked)}
            className="h-3.5 w-3.5 accent-brand"
            aria-label={`${isProvided ? "Include" : "Omit"} ${item.name} in this plan`}
          />
          <span
            className={cn(
              isProvided ? "text-brand/80" : "text-gray-400",
            )}
          >
            {rowLabel ?? "Omit"}
          </span>
        </label>
      )}
    </div>
  );
}

export function RecipeCard({
  recipe,
  onItemClick,
  onToggleAlternate,
  onToggleDisabled,
  onUseOnlyThis,
  enabled,
  disabled,
  inUse,
  hasCompetitors,
  providedInputSet,
  onToggleProvidedInput,
  productionPercent,
  onSetProductionPercent,
  emphasizeItemId,
}: RecipeCardProps) {
  const building =
    recipe.producedIn.length > 0 ? getBuilding(recipe.producedIn[0]) : undefined;
  const canToggleAlternate = recipe.alternate && !!onToggleAlternate;
  const canToggleDisabled = !!onToggleDisabled;
  const canUseOnly = !!onUseOnlyThis && !!hasCompetitors;

  return (
    <div
      className={cn(
        "@container card max-w-full min-w-0 p-2.5 sm:p-3",
        enabled && !disabled && "border-brand/40 bg-brand/5",
        inUse && "ring-1 ring-brand/40",
        disabled && "border-red-500/30 bg-red-500/5 opacity-70",
      )}
    >
      <div className="mb-2 flex min-w-0 flex-col gap-2 @[24rem]:flex-row @[24rem]:items-start @[24rem]:justify-between">
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
          <div className="min-w-0 break-words text-sm font-semibold">
            {recipe.name}
          </div>
          {recipe.alternate && (
            <span className="chip border-brand/60 text-brand">Alt</span>
          )}
          <SourceBadge source={recipe.unlockedBy.source} />
          <StatusChip
            alternate={recipe.alternate}
            disabled={disabled}
            enabled={enabled}
            inUse={inUse}
          />
        </div>
        {building && (
          <div className="flex min-w-0 max-w-full shrink-0 items-center gap-1.5 text-xs text-gray-400 @[24rem]:max-w-[11rem]">
            <ItemIcon
              className="shrink-0"
              iconUrl={building.iconUrl}
              alt={building.name}
              size={18}
            />
            <span className="min-w-0 truncate" title={building.name}>
              {building.name}
            </span>
          </div>
        )}
      </div>
      <div className="grid w-full min-w-0 grid-cols-1 items-center gap-y-2 @[22rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @[22rem]:items-start @[22rem]:gap-x-2 @[22rem]:gap-y-0">
        <div className="min-w-0 space-y-1">
          {recipe.ingredients.map((ing, idx) => (
            <IngredientRow
              key={`${ing.item}-${idx}`}
              ing={ing}
              onItemClick={onItemClick}
              isProvided={providedInputSet?.has(ing.item)}
              onToggleProvided={onToggleProvidedInput}
              rowLabel="Omit"
              rateMultiplier={recipe.alternate ? (productionPercent ?? 100) / 100 : 1}
              emphasized={Boolean(
                emphasizeItemId && ing.item === emphasizeItemId,
              )}
            />
          ))}
        </div>
        <div
          className="flex min-h-6 justify-center @[22rem]:min-h-0 @[22rem]:pt-1 @[22rem]:self-stretch"
          aria-hidden
        >
          <ArrowDown className="h-4 w-4 text-gray-500 @[22rem]:hidden" />
          <ArrowRight className="hidden h-4 w-4 shrink-0 self-center text-gray-500 @[22rem]:block" />
        </div>
        <div className="min-w-0 space-y-1">
          {recipe.products.map((p, idx) => (
            <IngredientRow
              key={`${p.item}-${idx}`}
              ing={p}
              onItemClick={onItemClick}
              rateMultiplier={recipe.alternate ? (productionPercent ?? 100) / 100 : 1}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex min-w-0 flex-col gap-2 text-[11px] text-gray-500 @[32rem]:flex-row @[32rem]:flex-wrap @[32rem]:items-center @[32rem]:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span>Duration: {recipe.duration}s</span>
          {recipe.maxPower > 0 && (
            <span>
              Power:{" "}
              {recipe.minPower === recipe.maxPower
                ? `${recipe.maxPower} MW`
                : `${recipe.minPower}-${recipe.maxPower} MW`}
            </span>
          )}
          {recipe.alternate && onSetProductionPercent && (
            <label className="flex items-center gap-1.5">
              <span>Preview %</span>
              <input
                type="number"
                min={10}
                max={300}
                step={5}
                value={Math.max(10, Math.min(300, productionPercent ?? 100))}
                onChange={(event) =>
                  onSetProductionPercent(Number(event.target.value))
                }
                className="input num w-16 px-1.5 py-0.5 text-right text-[11px]"
                title="Preview alternate throughput without changing planner settings"
              />
            </label>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {canToggleAlternate && !disabled && (
            <button
              type="button"
              onClick={() => onToggleAlternate?.(recipe.id)}
              className={cn(
                "btn px-2 py-1 text-xs",
                enabled && "btn-primary",
              )}
              title={
                enabled
                  ? "Remove this alternate from the planner"
                  : "Let the planner use this alternate recipe"
              }
            >
              {enabled ? (
                <>
                  <Check className="h-3 w-3" />
                  Enabled
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" />
                  Enable
                </>
              )}
            </button>
          )}
          {canUseOnly && !disabled && (
            <button
              type="button"
              onClick={() => onUseOnlyThis?.(recipe.id)}
              className="btn px-2 py-1 text-xs"
              title="Force the planner to use this recipe by disabling every other recipe that produces the same product."
            >
              <Target className="h-3 w-3" />
              Use only this
            </button>
          )}
          {canToggleDisabled && (
            <button
              type="button"
              onClick={() => onToggleDisabled?.(recipe.id)}
              className={cn(
                "btn px-2 py-1 text-xs",
                disabled && "border-red-500/60 text-red-300",
              )}
              title={
                disabled
                  ? "Re-enable this recipe for the planner"
                  : "Prevent the planner from using this recipe"
              }
            >
              {disabled ? (
                <>
                  <Check className="h-3 w-3" />
                  Re-enable
                </>
              ) : (
                <>
                  <Ban className="h-3 w-3" />
                  Disable
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
