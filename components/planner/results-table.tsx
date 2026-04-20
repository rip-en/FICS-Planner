"use client";

import { AlertTriangle, Factory, Flame, Gauge, Zap } from "lucide-react";
import { getBuilding, getItem, getRecipe } from "@/lib/data";
import type { SolverResult } from "@/lib/planner/types";
import { cn, formatPower, formatRate } from "@/lib/utils";
import { ItemIcon } from "@/components/item-icon";

interface ResultsTableProps {
  result: SolverResult;
  onInspect: (itemId: string) => void;
}

export function ResultsTable({ result, onInspect }: ResultsTableProps) {
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          icon={<Factory className="h-4 w-4" />}
          label="Buildings"
          value={String(result.totalBuildings)}
          hint={`${result.recipes.length} recipes`}
        />
        <SummaryCard
          icon={<Zap className="h-4 w-4" />}
          label="Power"
          value={formatPower(result.totalPowerMW)}
        />
        <SummaryCard
          icon={<Flame className="h-4 w-4" />}
          label="Raw inputs"
          value={String(result.rawInputs.length)}
          hint={
            result.rawInputs
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

      <Block title="Recipes in use">
        <div className="overflow-hidden rounded-md border border-surface-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="p-2 text-left">Recipe</th>
                <th className="p-2 text-right">Buildings</th>
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
                    <td className="num p-2 text-right">
                      {formatRate(usage.buildings, 2)}
                    </td>
                    <td className="num p-2 text-right text-gray-400">
                      {formatPower(usage.powerMW)}
                    </td>
                    <td className="p-2">
                      <ItemRateList
                        rows={usage.inputs}
                        onClick={onInspect}
                      />
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
      </Block>

      {result.missingInputs.length > 0 && (
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

      {result.rawInputs.length > 0 && (
        <Block title="Raw inputs">
          <ItemRateGrid rows={result.rawInputs} onClick={onInspect} />
        </Block>
      )}

      {result.byproducts.length > 0 && (
        <Block title="Byproducts (surplus)">
          <ItemRateGrid
            rows={result.byproducts}
            onClick={onInspect}
            highlight
          />
        </Block>
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

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ItemRateList({
  rows,
  onClick,
}: {
  rows: Array<{ itemId: string; ratePerMin: number }>;
  onClick: (itemId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {rows.map((r) => {
        const it = getItem(r.itemId);
        if (!it) return null;
        return (
          <button
            key={r.itemId}
            type="button"
            onClick={() => onClick(r.itemId)}
            className="flex items-center gap-1 rounded-md border border-surface-border bg-surface px-1.5 py-0.5 text-xs hover:border-brand/60"
          >
            <ItemIcon iconUrl={it.iconUrl} alt={it.name} size={16} />
            <span className="num text-gray-400">
              {formatRate(r.ratePerMin)}
            </span>
          </button>
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
