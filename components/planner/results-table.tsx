"use client";

import { AlertTriangle, Factory, Flame, Gauge, Zap } from "lucide-react";
import { useMemo } from "react";
import { getBuilding, getItem, getRecipe } from "@/lib/data";
import { buildProductionFlowEdges } from "@/lib/planner/production-flow";
import type { SolverResult } from "@/lib/planner/types";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  cn,
  formatBuildingsCount,
  formatPower,
  formatRate,
} from "@/lib/utils";
import { ItemIcon } from "@/components/item-icon";

interface ResultsTableProps {
  result: SolverResult;
  onInspect: (itemId: string) => void;
  providedInputs: string[];
  onToggleProvidedInput: (itemId: string, provided: boolean) => void;
  hiddenSectionIds?: string[];
}

export function ResultsTable({
  result,
  onInspect,
  providedInputs,
  onToggleProvidedInput,
  hiddenSectionIds = [],
}: ResultsTableProps) {
  const flowEdges = useMemo(() => buildProductionFlowEdges(result), [result]);
  const fractionalBuildingsTotal = useMemo(
    () => result.recipes.reduce((s, u) => s + u.buildings, 0),
    [result.recipes],
  );
  const providedInputSet = useMemo(
    () => new Set(providedInputs),
    [providedInputs],
  );
  const hiddenSectionIdSet = useMemo(
    () => new Set(hiddenSectionIds),
    [hiddenSectionIds],
  );

  if (!result.feasible) {
    return (
      <div className="card border-red-500/40 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 text-red-300">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Plan is infeasible</span>
        </div>
        <ul className="mt-2 list-disc pl-6 text-xs text-red-200">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (result.recipes.length === 0 && result.missingInputs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {!hiddenSectionIdSet.has("summary-cards") && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            icon={<Factory className="h-4 w-4" />}
            label="Buildings"
            value={formatBuildingsCount(fractionalBuildingsTotal)}
            hint={`${result.recipes.length} recipes · Σ fractional machines (100% clock)`}
          />
          <SummaryCard
            icon={<Zap className="h-4 w-4" />}
            label="Power"
            value={formatPower(result.totalPowerMW)}
          />
          <SummaryCard
            icon={<Flame className="h-4 w-4" />}
            label="External inputs"
            value={String(result.rawInputs.length + result.providedInputs.length)}
            hint={
              [...result.rawInputs, ...result.providedInputs]
                .slice(0, 2)
                .map((r) => getItem(r.itemId)?.name)
                .filter(Boolean)
                .join(", ") || undefined
            }
          />
          <SummaryCard
            icon={<Gauge className="h-4 w-4" />}
            label="Byproducts"
            value={String(result.byproducts.length)}
            warn={result.byproducts.length > 0}
          />
        </div>
      )}

      {!hiddenSectionIdSet.has("recipes-in-use") && (
        <CollapsibleSection title="Recipes in use" contentClassName="mt-0">
          <div className="-mx-1 overflow-x-auto overflow-y-hidden rounded-md border border-surface-border sm:mx-0">
          <table className="w-full min-w-[640px] text-sm sm:min-w-0">
            <thead className="bg-surface text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="p-2 text-left">Recipe</th>
                <th
                  className="p-2 text-right"
                  title="Fractional machines at 100% clock (3 decimal places)."
                >
                  Buildings
                </th>
                <th className="p-2 text-right">Power</th>
                <th className="p-2 text-left">Inputs</th>
                <th className="p-2 text-left">Outputs</th>
              </tr>
            </thead>
            <tbody>
              {result.recipes.map((usage) => {
                const recipe = getRecipe(usage.recipeId);
                const building = usage.buildingId
                  ? getBuilding(usage.buildingId)
                  : undefined;
                if (!recipe) return null;
                const visibleInputs = usage.inputs.filter(
                  (row) => !providedInputSet.has(row.itemId),
                );
                const omittedInputs = usage.inputs.filter((row) =>
                  providedInputSet.has(row.itemId),
                );
                return (
                  <tr
                    key={usage.recipeId}
                    className="border-t border-surface-border align-top"
                  >
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{recipe.name}</span>
                        {recipe.alternate && (
                          <span className="chip border-brand/60 text-brand">
                            Alt
                          </span>
                        )}
                      </div>
                      {building && (
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                          <ItemIcon
                            iconUrl={building.iconUrl}
                            alt={building.name}
                            size={14}
                          />
                          {building.name}
                        </div>
                      )}
                    </td>
                    <td
                      className="num p-2 text-right"
                      title="Fractional machines at 100% clock"
                    >
                      {formatBuildingsCount(usage.buildings)}
                    </td>
                    <td className="num p-2 text-right text-gray-400">
                      {formatPower(usage.powerMW)}
                    </td>
                    <td className="p-2">
                      <ItemRateList
                        rows={visibleInputs}
                        onClick={onInspect}
                        onToggleProvidedInput={onToggleProvidedInput}
                        emptyLabel="All inputs excluded"
                      />
                      {omittedInputs.length > 0 && (
                        <div className="mt-1.5">
                          <ItemRateList
                            rows={omittedInputs}
                            onClick={onInspect}
                            onToggleProvidedInput={onToggleProvidedInput}
                            compact
                            toggleLabel="Restore"
                          />
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <ItemRateList
                        rows={usage.outputs}
                        onClick={onInspect}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </CollapsibleSection>
      )}

      {!hiddenSectionIdSet.has("production-chains") && flowEdges.length > 0 && (
        <CollapsibleSection
          title={`Production chains · ${flowEdges.length}`}
          contentClassName="space-y-2"
        >
          <p className="mb-1 text-[11px] text-gray-500">
            How intermediates move between recipes in this plan (rates split when
            several machines make the same item).
          </p>
          <div className="space-y-2">
            {flowEdges.map((e) => (
              <FlowEdgeRow key={`${e.fromRecipeId}-${e.itemId}-${e.toRecipeId}`} edge={e} onInspect={onInspect} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {!hiddenSectionIdSet.has("missing-inputs") &&
        result.missingInputs.length > 0 && (
        <div className="card border-amber-500/50 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">
              Missing inputs ({result.missingInputs.length})
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-200/80">
            Every recipe that produces these items is currently disabled in
            your plan. The solver is treating them as free inputs to stay
            feasible. Re-enable a recipe for each item (via its detail drawer)
            to close the production loop.
          </p>
          <div className="mt-3">
            <ItemRateGrid
              rows={result.missingInputs}
              onClick={onInspect}
              highlight
            />
          </div>
        </div>
      )}

      {!hiddenSectionIdSet.has("raw-inputs") && result.rawInputs.length > 0 && (
        <CollapsibleSection title="Raw inputs" contentClassName="mt-0">
          <ItemRateGrid rows={result.rawInputs} onClick={onInspect} />
        </CollapsibleSection>
      )}
      {!hiddenSectionIdSet.has("already-made-inputs") &&
        result.providedInputs.length > 0 && (
        <CollapsibleSection title="Already-made inputs" contentClassName="mt-0">
          <ItemRateGrid rows={result.providedInputs} onClick={onInspect} />
        </CollapsibleSection>
      )}

      {!hiddenSectionIdSet.has("byproducts") && result.byproducts.length > 0 && (
        <CollapsibleSection title="Byproducts (surplus)" contentClassName="mt-0">
          <ItemRateGrid
            rows={result.byproducts}
            onClick={onInspect}
            highlight
          />
        </CollapsibleSection>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "card relative overflow-hidden p-3",
        warn && "border-amber-500/50 bg-amber-500/5",
      )}
    >
      <div className="belt absolute inset-x-0 top-0" aria-hidden />
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="num mt-1 text-xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-gray-500">{hint}</div>}
    </div>
  );
}

function FlowEdgeRow({
  edge,
  onInspect,
}: {
  edge: ReturnType<typeof buildProductionFlowEdges>[number];
  onInspect: (itemId: string) => void;
}) {
  const fromRecipe = getRecipe(edge.fromRecipeId);
  const toRecipe = getRecipe(edge.toRecipeId);
  const item = getItem(edge.itemId);
  if (!fromRecipe || !toRecipe || !item) return null;

  const fromBuildingId = fromRecipe.producedIn[0];
  const toBuildingId = toRecipe.producedIn[0];
  const fromBuilding = fromBuildingId ? getBuilding(fromBuildingId) : undefined;
  const toBuilding = toBuildingId ? getBuilding(toBuildingId) : undefined;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-surface-border bg-surface/50 px-2.5 py-2 text-xs">
      <div className="flex min-w-0 max-w-[42%] items-center gap-1.5 sm:max-w-none">
        {fromBuilding && (
          <ItemIcon
            iconUrl={fromBuilding.iconUrl}
            alt={fromBuilding.name}
            size={16}
          />
        )}
        <span className="min-w-0 truncate font-medium text-gray-200" title={fromRecipe.name}>
          {fromRecipe.name}
        </span>
      </div>
      <span className="text-gray-600">→</span>
      <button
        type="button"
        onClick={() => onInspect(item.id)}
        className="flex min-w-0 items-center gap-1.5 rounded-md border border-surface-border bg-surface px-1.5 py-0.5 hover:border-brand/60"
        title={item.name}
      >
        <ItemIcon iconUrl={item.iconUrl} alt={item.name} size={18} />
        <span className="truncate font-medium">{item.name}</span>
        <span className="num shrink-0 text-gray-400">{formatRate(edge.ratePerMin)}</span>
      </button>
      <span className="text-gray-600">→</span>
      <div className="flex min-w-0 max-w-[42%] items-center gap-1.5 sm:max-w-none">
        <span className="min-w-0 truncate font-medium text-gray-200" title={toRecipe.name}>
          {toRecipe.name}
        </span>
        {toBuilding && (
          <ItemIcon
            iconUrl={toBuilding.iconUrl}
            alt={toBuilding.name}
            size={16}
          />
        )}
      </div>
    </div>
  );
}

function ItemRateList({
  rows,
  onClick,
  onToggleProvidedInput,
  emptyLabel,
  compact,
  toggleLabel,
}: {
  rows: Array<{ itemId: string; ratePerMin: number }>;
  onClick: (itemId: string) => void;
  onToggleProvidedInput?: (itemId: string, provided: boolean) => void;
  emptyLabel?: string;
  compact?: boolean;
  toggleLabel?: string;
}) {
  if (rows.length === 0) {
    return <span className="text-xs text-gray-500">{emptyLabel ?? "None"}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((r) => {
        const it = getItem(r.itemId);
        if (!it) return null;
        return (
          <div
            key={r.itemId}
            className={cn(
              "flex items-center gap-1 rounded-md border border-surface-border bg-surface px-1.5 py-0.5 text-xs",
              compact && "bg-surface/50 text-gray-400",
            )}
          >
            <button
              type="button"
              onClick={() => onClick(r.itemId)}
              className="flex min-w-0 items-center gap-1 hover:text-brand"
              title={it.name}
            >
              <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={16} />
              <span className="truncate">{it.name}</span>
              <span className="num text-gray-400">{formatRate(r.ratePerMin)}</span>
            </button>
            {onToggleProvidedInput && (
              <button
                type="button"
                onClick={() => onToggleProvidedInput(r.itemId, !compact)}
                className="rounded border border-surface-border px-1 py-0.5 text-[10px] hover:border-brand/60"
                title={
                  compact
                    ? "Include this input in recipe requirements"
                    : "Omit this input from recipe requirements"
                }
              >
                {toggleLabel ?? "Omit"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ItemRateGrid({
  rows,
  onClick,
  highlight,
}: {
  rows: Array<{ itemId: string; ratePerMin: number }>;
  onClick: (itemId: string) => void;
  highlight?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {rows.map((r) => {
        const it = getItem(r.itemId);
        if (!it) return null;
        return (
          <button
            key={r.itemId}
            type="button"
            onClick={() => onClick(r.itemId)}
            className={cn(
              "card flex items-center gap-2 p-2 text-left transition hover:border-brand/60",
              highlight && "border-amber-500/50",
            )}
          >
            <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{it.name}</div>
              <div className="num text-xs text-gray-400">
                {formatRate(r.ratePerMin)} /min
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
