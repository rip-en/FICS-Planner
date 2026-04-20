import type { SolverResult } from "./types";

const EPS = 1e-6;

/** One directed link: a recipe’s output item feeds another recipe’s input. */
export interface ProductionFlowEdge {
  itemId: string;
  fromRecipeId: string;
  toRecipeId: string;
  /** Approximate flow (items/min) on this link after splitting shared outputs. */
  ratePerMin: number;
}

/**
 * Build machine-to-machine links for the solved plan. When several recipes
 * produce the same intermediate, each consumer’s demand is split across
 * producers in proportion to their output rates (matches overall mass balance).
 */
export function buildProductionFlowEdges(result: SolverResult): ProductionFlowEdge[] {
  if (!result.feasible || result.recipes.length === 0) return [];

  const prodByItem = new Map<string, Map<string, number>>();
  const consByItem = new Map<string, Map<string, number>>();

  for (const u of result.recipes) {
    for (const o of u.outputs) {
      let m = prodByItem.get(o.itemId);
      if (!m) {
        m = new Map();
        prodByItem.set(o.itemId, m);
      }
      m.set(u.recipeId, (m.get(u.recipeId) ?? 0) + o.ratePerMin);
    }
    for (const inp of u.inputs) {
      let m = consByItem.get(inp.itemId);
      if (!m) {
        m = new Map();
        consByItem.set(inp.itemId, m);
      }
      m.set(u.recipeId, (m.get(u.recipeId) ?? 0) + inp.ratePerMin);
    }
  }

  const edges: ProductionFlowEdge[] = [];

  for (const [itemId, consMap] of consByItem) {
    const prodMap = prodByItem.get(itemId);
    if (!prodMap) continue;

    let totalProd = 0;
    for (const v of prodMap.values()) totalProd += v;
    if (totalProd <= EPS) continue;

    for (const [toRecipeId, consRate] of consMap) {
      if (consRate <= EPS) continue;
      for (const [fromRecipeId, prodRate] of prodMap) {
        if (prodRate <= EPS || fromRecipeId === toRecipeId) continue;
        const share = prodRate / totalProd;
        const allocated = consRate * share;
        if (allocated > EPS) {
          edges.push({
            itemId,
            fromRecipeId,
            toRecipeId,
            ratePerMin: allocated,
          });
        }
      }
    }
  }

  edges.sort((a, b) => {
    const itemCmp = (a.itemId).localeCompare(b.itemId);
    if (itemCmp !== 0) return itemCmp;
    const fromCmp = a.fromRecipeId.localeCompare(b.fromRecipeId);
    if (fromCmp !== 0) return fromCmp;
    return a.toRecipeId.localeCompare(b.toRecipeId);
  });

  return edges;
}
