"use client";

import { ArrowRight, Ban, Check, CircleSlash, Plus, Target } from "lucide-react";
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
}: {
  ing: RecipeIngredient;
  onItemClick?: (itemId: string) => void;
}) {
  const item = getItem(ing.item);
  if (!item) return null;
  return (
    <button
      type="button"
      onClick={() => onItemClick?.(item.id)}
      className="flex w-full items-center gap-2 rounded-md border border-surface-border bg-surface px-2 py-1 text-left transition hover:border-brand/60"
    >
      <ItemIcon iconUrl={item.iconUrl} alt={item.name} size={24} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">
          {ing.amount}x {item.name}
        </div>
        <div className="text-[11px] text-gray-500">
          {formatRate(ing.ratePerMin)} /min
        </div>
      </div>
    </button>
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
}: RecipeCardProps) {
  const building =
    recipe.producedIn.length > 0 ? getBuilding(recipe.producedIn[0]) : undefined;
  const canToggleAlternate = recipe.alternate && !!onToggleAlternate;
  const canToggleDisabled = !!onToggleDisabled;
  const canUseOnly = !!onUseOnlyThis && !!hasCompetitors;

  return (
    <div
      className={cn(
        "card p-3",
        enabled && !disabled && "border-brand/40 bg-brand/5",
        inUse && "ring-1 ring-brand/40",
        disabled && "border-red-500/30 bg-red-500/5 opacity-70",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold">{recipe.name}</div>
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
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <ItemIcon
              iconUrl={building.iconUrl}
              alt={building.name}
              size={18}
            />
            <span>{building.name}</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="space-y-1">
          {recipe.ingredients.map((ing) => (
            <IngredientRow key={ing.item} ing={ing} onItemClick={onItemClick} />
          ))}
        </div>
        <ArrowRight className="h-4 w-4 text-gray-500" aria-hidden />
        <div className="space-y-1">
          {recipe.products.map((p) => (
            <IngredientRow key={p.item} ing={p} onItemClick={onItemClick} />
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
        <div className="flex items-center gap-3">
          <span>Duration: {recipe.duration}s</span>
          {recipe.maxPower > 0 && (
            <span>
              Power:{" "}
              {recipe.minPower === recipe.maxPower
                ? `${recipe.maxPower} MW`
                : `${recipe.minPower}-${recipe.maxPower} MW`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
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
