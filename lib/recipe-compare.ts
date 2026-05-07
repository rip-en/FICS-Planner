import { getItem } from "@/lib/data";
import { formatRate } from "@/lib/utils";
import type { ClassName, Recipe } from "@/types/game";

const EPS = 1e-7;

/** Product line with the highest output rate (main product for comparison). */
export function dominantProductId(recipe: Recipe): ClassName | undefined {
  if (recipe.products.length === 0) return undefined;
  let best = recipe.products[0]!;
  for (const p of recipe.products) {
    if (p.ratePerMin > best.ratePerMin) best = p;
  }
  return best.item;
}

function aggregatePerPrimaryUnit(
  recipe: Recipe,
  primaryItemId: ClassName,
  mode: "ingredients" | "products",
): Record<ClassName, number> | null {
  const primaryRate =
    recipe.products.find((p) => p.item === primaryItemId)?.ratePerMin ?? 0;
  if (primaryRate <= EPS) return null;
  const scale = 1 / primaryRate;
  const out: Record<ClassName, number> = {};
  const list = mode === "ingredients" ? recipe.ingredients : recipe.products;
  for (const row of list) {
    out[row.item] = (out[row.item] ?? 0) + row.ratePerMin * scale;
  }
  return out;
}

export interface FlowDeltaRow {
  itemId: ClassName;
  baseline: number;
  alternate: number;
  delta: number;
}

/**
 * Compare ingredient draw and co-product rates vs a baseline recipe, normalized
 * so both recipes are expressed per 1/min of `primaryItemId` output.
 */
export function compareAlternateToBaseline(
  alternate: Recipe,
  baseline: Recipe,
  primaryItemId: ClassName,
): { inputs: FlowDeltaRow[]; outputs: FlowDeltaRow[] } | null {
  const baseIn = aggregatePerPrimaryUnit(
    baseline,
    primaryItemId,
    "ingredients",
  );
  const altIn = aggregatePerPrimaryUnit(alternate, primaryItemId, "ingredients");
  const baseOut = aggregatePerPrimaryUnit(
    baseline,
    primaryItemId,
    "products",
  );
  const altOut = aggregatePerPrimaryUnit(alternate, primaryItemId, "products");
  if (!baseIn || !altIn || !baseOut || !altOut) return null;

  const inIds = new Set<ClassName>([
    ...Object.keys(baseIn),
    ...Object.keys(altIn),
  ] as ClassName[]);
  const inputs: FlowDeltaRow[] = [];
  for (const id of inIds) {
    const b = baseIn[id] ?? 0;
    const a = altIn[id] ?? 0;
    const d = a - b;
    if (Math.abs(d) < EPS) continue;
    inputs.push({ itemId: id, baseline: b, alternate: a, delta: d });
  }
  inputs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const outIds = new Set<ClassName>([
    ...Object.keys(baseOut),
    ...Object.keys(altOut),
  ] as ClassName[]);
  const outputs: FlowDeltaRow[] = [];
  for (const id of outIds) {
    const b = baseOut[id] ?? 0;
    const a = altOut[id] ?? 0;
    const d = a - b;
    if (id === primaryItemId && Math.abs(d) < EPS) continue;
    if (Math.abs(d) < EPS) continue;
    outputs.push({ itemId: id, baseline: b, alternate: a, delta: d });
  }
  outputs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return { inputs, outputs };
}

/**
 * Short tooltip text listing the largest input/output deltas vs standard
 * (for dashboard alternate toggles).
 */
export function formatAlternateImpactSummary(
  alternate: Recipe,
  baseline: Recipe,
  primaryItemId: ClassName,
  maxParts = 6,
): string | null {
  const d = compareAlternateToBaseline(alternate, baseline, primaryItemId);
  if (!d) return null;
  const rows = [...d.inputs, ...d.outputs].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  );
  if (rows.length === 0) return null;
  const chunks: string[] = [];
  for (let i = 0; i < rows.length && chunks.length < maxParts; i++) {
    const row = rows[i]!;
    const it = getItem(row.itemId);
    if (!it) continue;
    const sign = row.delta > 0 ? "+" : row.delta < 0 ? "−" : "";
    const mag = formatRate(Math.abs(row.delta));
    chunks.push(`${it.name} ${sign}${mag}/min`);
  }
  if (chunks.length === 0) return null;
  return `vs standard (same product rate): ${chunks.join(" · ")}`;
}
