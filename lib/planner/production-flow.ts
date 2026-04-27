import { getRecipe, recipeIdsProducingItemInPlan } from "@/lib/data";
import type { ClassName } from "@/types/game";
import type { RecipeUsage, SolverResult } from "./types";

const EPS = 1e-6;
const RAS_ITERS = 40;
/** Disallowed producer→consumer pairs get this weight so RAS keeps flow on valid edges. */
const DISALLOWED_WEIGHT = 1e-12;

/** One directed link: a recipe’s output item feeds another recipe’s input. */
export interface ProductionFlowEdge {
  itemId: string;
  fromRecipeId: string;
  toRecipeId: string;
  /** Approximate flow (items/min) on this link. */
  ratePerMin: number;
}

type TarjanState = {
  index: number;
  stack: string[];
  onStack: Set<string>;
  indexOf: Map<string, number>;
  lowlink: Map<string, number>;
  scc: Map<string, number>;
  sccCount: number;
  adj: Map<string, string[]>;
};

function tarjanDfs(
  u: string,
  state: TarjanState,
): void {
  const { indexOf, lowlink, stack, onStack, adj } = state;
  indexOf.set(u, state.index);
  lowlink.set(u, state.index);
  state.index += 1;
  stack.push(u);
  onStack.add(u);

  for (const v of adj.get(u) ?? []) {
    if (!indexOf.has(v)) {
      tarjanDfs(v, state);
      lowlink.set(u, Math.min(lowlink.get(u)!, lowlink.get(v)!));
    } else if (onStack.has(v)) {
      lowlink.set(u, Math.min(lowlink.get(u)!, indexOf.get(v)!));
    }
  }

  if (lowlink.get(u) === indexOf.get(u)) {
    while (stack.length) {
      const w = stack.pop()!;
      onStack.delete(w);
      state.scc.set(w, state.sccCount);
      if (w === u) break;
    }
    state.sccCount += 1;
  }
}

/**
 * For each product edge A→B, link SCC(A) before SCC(B) in the item flow sense.
 * Used so inter-machine flows follow the recipe dependency graph (or stay in-cycle).
 */
function sccByRecipeGraph(recipeIds: string[]): {
  scc: Map<string, number>;
  sccCount: number;
} {
  if (recipeIds.length === 0) {
    return { scc: new Map(), sccCount: 0 };
  }
  const idSet = new Set(recipeIds);
  const adj = new Map<string, string[]>();
  for (const id of recipeIds) adj.set(id, []);
  for (const t of recipeIds) {
    const rT = getRecipe(t);
    if (!rT) continue;
    for (const ing of rT.ingredients) {
      for (const s of recipeIdsProducingItemInPlan(ing.item as ClassName, idSet)) {
        if (s === t) continue;
        (adj.get(s) as string[]).push(t);
      }
    }
  }
  const state: TarjanState = {
    index: 0,
    indexOf: new Map(),
    lowlink: new Map(),
    stack: [],
    onStack: new Set(),
    scc: new Map(),
    sccCount: 0,
    adj,
  };
  for (const id of recipeIds) {
    if (!state.indexOf.has(id)) tarjanDfs(id, state);
  }
  return { scc: state.scc, sccCount: state.sccCount };
}

/**
 * Kahn on the condensation of {recipeIds, edges between SCCs}.
 * Returns a topological order id for each SCC, or 0 for empty graph.
 */
function sccCondenstationOrder(
  scc: Map<string, number>,
  sccCount: number,
  recipeIds: string[],
): number[] {
  if (sccCount === 0) return [];
  const idSet = new Set(recipeIds);
  const adj: number[][] = Array.from({ length: sccCount }, () => []);
  const indeg = new Array(sccCount).fill(0);
  for (const t of recipeIds) {
    const a = scc.get(t);
    if (a === undefined) continue;
    const rT = getRecipe(t);
    if (!rT) continue;
    for (const ing of rT.ingredients) {
      for (const s of recipeIdsProducingItemInPlan(ing.item as ClassName, idSet)) {
        if (s === t) continue;
        const b = scc.get(s);
        if (b === undefined || a === b) continue;
        if (!adj[b].includes(a)) {
          adj[b].push(a);
          indeg[a] += 1;
        }
      }
    }
  }
  // Edge b -> a: producer scc b feeds consumer in scc a (S produces item for T).
  const order = new Array(sccCount).fill(-1);
  const q: number[] = [];
  for (let i = 0; i < sccCount; i++) {
    if (indeg[i] === 0) q.push(i);
  }
  let pos = 0;
  const seen = 0;
  while (q.length) {
    const u = q.shift()!;
    if (order[u] !== -1) continue;
    order[u] = pos++;
    for (const v of adj[u]) {
      indeg[v] -= 1;
      if (indeg[v] === 0) q.push(v);
    }
  }
  if (pos < sccCount) {
    for (let i = 0; i < sccCount; i++) {
      if (order[i] === -1) order[i] = pos++;
    }
  }
  return order;
}

/**
 * Order recipe rows from upstream (toward raw inputs) to downstream (toward targets),
 * using the same SCC condensation as {@link buildProductionFlowEdges}. Within the
 * same strongly connected component, order is stable by recipe id.
 */
export function sortRecipeUsagesByProductionFlow(usages: RecipeUsage[]): RecipeUsage[] {
  if (usages.length <= 1) return usages.slice();
  const recipeIds = usages.map((u) => u.recipeId);
  const { scc, sccCount } = sccByRecipeGraph(recipeIds);
  if (sccCount === 0) return usages.slice();
  const sccOrder = sccCondenstationOrder(scc, sccCount, recipeIds);
  return [...usages].sort((a, b) => {
    const sa = scc.get(a.recipeId);
    const sb = scc.get(b.recipeId);
    if (sa === undefined || sb === undefined) return a.recipeId.localeCompare(b.recipeId);
    const oa = sccOrder[sa] ?? 0;
    const ob = sccOrder[sb] ?? 0;
    if (oa !== ob) return oa - ob;
    return a.recipeId.localeCompare(b.recipeId);
  });
}

function sccForwardReachable(
  sccCount: number,
  scc: Map<string, number>,
  recipeIds: string[],
): boolean[][] {
  const idSet = new Set(recipeIds);
  const adj: Set<number>[] = Array.from({ length: sccCount }, () => new Set());
  for (const t of recipeIds) {
    const a = scc.get(t);
    if (a === undefined) continue;
    const rT = getRecipe(t);
    if (!rT) continue;
    for (const ing of rT.ingredients) {
      for (const s of recipeIdsProducingItemInPlan(ing.item as ClassName, idSet)) {
        if (s === t) continue;
        const b = scc.get(s);
        if (b === undefined || a === b) continue;
        adj[b].add(a);
      }
    }
  }
  const reach: boolean[][] = Array.from({ length: sccCount }, () =>
    new Array(sccCount).fill(false),
  );
  for (let s = 0; s < sccCount; s++) {
    const stack = [s];
    reach[s][s] = true;
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of adj[u]) {
        if (!reach[s][v]) {
          reach[s][v] = true;
          stack.push(v);
        }
      }
    }
  }
  return reach;
}

/**
 * Iterative row/column scaling to match target row and column sums on allowed edges
 * (Sinkhorn for bipartite support).
 */
function balanceTransport(
  rowTarget: number[],
  colTarget: number[],
  allow: (p: number, c: number) => boolean,
): number[][] {
  const P = rowTarget.length;
  const C = colTarget.length;
  const m: number[][] = Array.from({ length: P }, () => new Array(C).fill(0));
  for (let p = 0; p < P; p++) {
    for (let c = 0; c < C; c++) {
      m[p][c] = allow(p, c) ? 1 : DISALLOWED_WEIGHT;
    }
  }
  for (let p = 0; p < P; p++) {
    if (m[p].reduce((a, b) => a + b, 0) < EPS) m[p].fill(1);
  }
  for (let c = 0; c < C; c++) {
    let s = 0;
    for (let p = 0; p < P; p++) s += m[p][c];
    if (s < EPS) for (let p = 0; p < P; p++) m[p][c] = 1;
  }
  for (let iter = 0; iter < RAS_ITERS; iter++) {
    for (let p = 0; p < P; p++) {
      const rs = m[p].reduce((a, b) => a + b, 0);
      if (rs < EPS) continue;
      const t = rowTarget[p] / rs;
      for (let c = 0; c < C; c++) m[p][c] *= t;
    }
    for (let c = 0; c < C; c++) {
      let cs = 0;
      for (let p = 0; p < P; p++) cs += m[p][c];
      if (cs < EPS) continue;
      const t = colTarget[c] / cs;
      for (let p = 0; p < P; p++) m[p][c] *= t;
    }
  }
  return m;
}

/**
 * Build machine-to-machine links for the solved plan. Splits shared outputs
 * with a **dependency-aware** flow: an edge exists only if the producing
 * recipe’s SCC can reach the consumer’s in the **recipe-dependency** DAG of
 * SCCs (or they share an SCC, for recycling), then scales flows so row and
 * column totals match per-item output/consumption rates.
 */
export function buildProductionFlowEdges(result: SolverResult): ProductionFlowEdge[] {
  if (!result.feasible || result.recipes.length === 0) return [];

  const recipeIds = result.recipes.map((u) => u.recipeId);
  const { scc, sccCount } = sccByRecipeGraph(recipeIds);
  if (sccCount === 0) return [];
  const reachScc = sccForwardReachable(sccCount, scc, recipeIds);

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

    const pIds: string[] = Array.from(prodMap.keys());
    const cIds: string[] = Array.from(consMap.keys());
    if (pIds.length === 0 || cIds.length === 0) continue;

    const rowT = pIds.map((id) => prodMap.get(id) ?? 0);
    const colT = cIds.map((id) => consMap.get(id) ?? 0);

    const allow = (p: number, c: number): boolean => {
      const fromId = pIds[p];
      const toId = cIds[c];
      if (fromId === toId) return false;
      const a = scc.get(fromId) ?? 0;
      const b = scc.get(toId) ?? 0;
      if (a === b) return true;
      return reachScc[a]![b]!;
    };

    const mat = balanceTransport(rowT, colT, allow);
    for (let p = 0; p < pIds.length; p++) {
      for (let c = 0; c < cIds.length; c++) {
        const rate = mat[p]![c]!;
        if (rate <= EPS) continue;
        const fromId = pIds[p]!;
        const toId = cIds[c]!;
        if (fromId === toId) continue;
        edges.push({ itemId, fromRecipeId: fromId, toRecipeId: toId, ratePerMin: rate });
      }
    }
  }

  edges.sort((a, b) => {
    const itemCmp = a.itemId.localeCompare(b.itemId);
    if (itemCmp !== 0) return itemCmp;
    const fromCmp = a.fromRecipeId.localeCompare(b.fromRecipeId);
    if (fromCmp !== 0) return fromCmp;
    return a.toRecipeId.localeCompare(b.toRecipeId);
  });

  return edges;
}
