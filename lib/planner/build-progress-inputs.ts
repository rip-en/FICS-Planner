import { getItem } from "@/lib/data";
import type { RecipeUsage } from "@/lib/planner/types";

/**
 * Sums ingredient rates for recipe lines that are not excluded (e.g. still on the
 * build checklist). Matches how each RecipeUsage.inputs row is produced in the solver.
 */
export function aggregateInputsFromUsages(
  usages: RecipeUsage[],
  opts: {
    excludeRecipeIds: ReadonlySet<string>;
    excludeItemIds: ReadonlySet<string>;
  },
): Map<string, number> {
  const m = new Map<string, number>();
  for (const usage of usages) {
    if (opts.excludeRecipeIds.has(usage.recipeId)) continue;
    for (const row of usage.inputs) {
      if (opts.excludeItemIds.has(row.itemId)) continue;
      m.set(row.itemId, (m.get(row.itemId) ?? 0) + row.ratePerMin);
    }
  }
  return m;
}

export function ratesMapToRows(
  map: Map<string, number>,
): Array<{ itemId: string; ratePerMin: number }> {
  const rows = [...map.entries()]
    .filter(([, rate]) => rate > 1e-12)
    .map(([itemId, ratePerMin]) => ({ itemId, ratePerMin }));
  rows.sort((a, b) => {
    const na = getItem(a.itemId)?.name ?? a.itemId;
    const nb = getItem(b.itemId)?.name ?? b.itemId;
    return na.localeCompare(nb);
  });
  return rows;
}

export function filterRawRows(
  rows: Array<{ itemId: string; ratePerMin: number }>,
): Array<{ itemId: string; ratePerMin: number }> {
  return rows.filter((r) => getItem(r.itemId)?.isRaw);
}
