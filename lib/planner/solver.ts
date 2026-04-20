import LpSolver from "javascript-lp-solver";
import {
  allRecipes,
  buildings as buildingsMap,
  getBuilding,
  items as itemsMap,
  recipesProducing,
} from "@/lib/data";
import type { PlannerConfig, SolverResult } from "./types";

interface RawModel {
  optimize: string;
  opType: "min" | "max";
  constraints: Record<string, { min?: number; max?: number; equal?: number }>;
  variables: Record<string, Record<string, number>>;
}

const EPS = 1e-6;

/**
 * Decide which recipes are candidates:
 *  - must be machine recipes (not hand-crafted only)
 *  - skip explicitly disabled recipes
 *  - include alternates only if the user has enabled them
 */
/** Recipes eligible for the planner LP (respects disabled / alternate toggles). */
export function getActiveRecipesForPlanner(config: PlannerConfig) {
  const enabled = new Set(config.enabledAlternates);
  const disabled = new Set(config.disabledRecipes);
  return allRecipes().filter((r) => {
    if (!r.inMachine || r.forBuilding) return false;
    if (disabled.has(r.id)) return false;
    if (r.alternate && !enabled.has(r.id)) return false;
    return true;
  });
}

/**
 * Partition the "free to source" pool the LP uses to stay feasible:
 *
 *  - `raw`: items that are actually extraction-only (raw resources) OR
 *    foraged/drop-only items that have no recipe anywhere in the data
 *    (Mycelia, Leaves, Wood, Power Shards, Hard Drives, ...). These are
 *    legitimate raw inputs and we show them in the Raw inputs panel.
 *
 *  - `missing`: items that DO have production recipes in the game but every
 *    one of them is currently disabled/not-enabled in the user's plan. The
 *    solver still needs to source them to stay feasible, but in the UI
 *    these are surfaced as a "Missing inputs" warning so the user knows
 *    which recipe(s) to turn back on.
 */
interface AvailablePool {
  raw: Set<string>;
  missing: Set<string>;
  all: Set<string>;
}

function buildAvailablePool(activeRecipeIds: Set<string>): AvailablePool {
  const raw = new Set<string>();
  const missing = new Set<string>();

  for (const it of Object.values(itemsMap)) {
    if (it.isRaw) raw.add(it.id);
  }

  for (const id of Object.keys(itemsMap)) {
    const producers = recipesProducing(id);
    const producedByActive = producers.some((r) => activeRecipeIds.has(r.id));
    if (producedByActive) continue;

    // No active producer. Classify based on whether there's *any* machine
    // recipe for this item in the game at all.
    const hasAnyMachineRecipe = producers.some(
      (r) => r.inMachine && !r.forBuilding,
    );
    if (hasAnyMachineRecipe) {
      missing.add(id);
    } else {
      // Either truly raw or foraged/drop-only - fold into raw.
      raw.add(id);
    }
  }

  return { raw, missing, all: new Set([...raw, ...missing]) };
}

export function solvePlan(config: PlannerConfig): SolverResult {
  const recipes = getActiveRecipesForPlanner(config);
  const recipeIds = new Set(recipes.map((r) => r.id));
  const pool = buildAvailablePool(recipeIds);
  const available = pool.all;
  const targetMap = new Map(config.targets.map((t) => [t.itemId, t.rate]));

  if (config.targets.length === 0 || recipes.length === 0) {
    return {
      feasible: true,
      recipes: [],
      rawInputs: [],
      byproducts: [],
      missingInputs: [],
      totalPowerMW: 0,
      totalBuildings: 0,
      errors: [],
    };
  }

  // Which items need constraints? Anything referenced by any active recipe
  // plus all targets.
  const referenced = new Set<string>();
  for (const r of recipes) {
    for (const p of r.products) referenced.add(p.item);
    for (const i of r.ingredients) referenced.add(i.item);
  }
  for (const t of config.targets) referenced.add(t.itemId);

  const model: RawModel = {
    optimize: "cost",
    opType: "min",
    constraints: {},
    variables: {},
  };

  // Constraint for each non-raw referenced item: net output >= target (or 0).
  for (const itemId of referenced) {
    if (available.has(itemId) && !targetMap.has(itemId)) continue;
    const target = targetMap.get(itemId) ?? 0;
    model.constraints[itemId] = { min: target };
  }

  // One variable per active recipe; one extra variable per available item
  // that we use as a "raw sink" so the solver can source them freely.
  const objective = config.objective;

  for (const r of recipes) {
    const v: Record<string, number> = {};
    for (const out of r.products) {
      v[out.item] = (v[out.item] ?? 0) + out.ratePerMin;
    }
    for (const inp of r.ingredients) {
      v[inp.item] = (v[inp.item] ?? 0) - inp.ratePerMin;
    }
    // cost: minimize building count (runs) or raw inputs.
    if (objective === "buildings") {
      v.cost = 1;
    } else {
      // For "raw" objective, recipe variables are cheap; we charge the raw
      // sink vars instead (see below).
      v.cost = 0.001;
    }
    model.variables[r.id] = v;
  }

  // "Free-source" availability vars: one per available item so the LP stays
  // feasible and we can observe how much is being consumed. Missing inputs
  // (items whose recipes were all disabled) are weighted heavily so the
  // solver still prefers real production when any alternative exists.
  const rawCaps = config.rawCaps ?? {};

  for (const itemId of referenced) {
    if (!available.has(itemId)) continue;
    if (!model.constraints[itemId]) model.constraints[itemId] = { min: 0 };
    const isMissing = pool.missing.has(itemId);
    const v: Record<string, number> = { [itemId]: 1 };
    const cap = rawCaps[itemId];
    if (cap !== undefined && Number.isFinite(cap) && cap >= 0) {
      const capKey = `rawcap:${itemId}`;
      v[capKey] = 1;
      model.constraints[capKey] = { max: cap };
    }
    if (isMissing) {
      v.cost = 1000; // discourage using blocked items unless unavoidable
    } else {
      v.cost = objective === "raw" ? 1 : 0;
    }
    model.variables[`raw:${itemId}`] = v;
  }

  const solved = LpSolver.Solve(model) as Record<string, number> & {
    feasible?: boolean;
    result?: number;
  };

  if (!solved.feasible) {
    return {
      feasible: false,
      recipes: [],
      rawInputs: [],
      byproducts: [],
      missingInputs: config.targets.map((t) => ({
        itemId: t.itemId,
        ratePerMin: t.rate,
      })),
      totalPowerMW: 0,
      totalBuildings: 0,
      errors: [
        "No feasible plan — try enabling alternate recipes or check that your targets can be produced with the selected recipe set.",
      ],
    };
  }

  // Collate results.
  const usage: SolverResult["recipes"] = [];
  const net: Record<string, number> = {};

  for (const r of recipes) {
    const runs = solved[r.id] ?? 0;
    if (runs <= EPS) continue;
    const building = getBuilding(r.producedIn[0] ?? "");
    const powerPerRun = r.maxPower > 0 ? r.maxPower : building?.powerConsumption ?? 0;
    usage.push({
      recipeId: r.id,
      runs,
      buildings: runs,
      buildingId: r.producedIn[0],
      powerMW: runs * powerPerRun,
      inputs: r.ingredients.map((i) => ({
        itemId: i.item,
        ratePerMin: i.ratePerMin * runs,
      })),
      outputs: r.products.map((p) => ({
        itemId: p.item,
        ratePerMin: p.ratePerMin * runs,
      })),
    });
    for (const p of r.products) net[p.item] = (net[p.item] ?? 0) + p.ratePerMin * runs;
    for (const i of r.ingredients)
      net[i.item] = (net[i.item] ?? 0) - i.ratePerMin * runs;
  }

  const rawInputs: SolverResult["rawInputs"] = [];
  const missingInputs: SolverResult["missingInputs"] = [];
  for (const itemId of Array.from(available)) {
    const raw = solved[`raw:${itemId}`] ?? 0;
    if (raw <= EPS) continue;
    if (pool.missing.has(itemId)) {
      missingInputs.push({ itemId, ratePerMin: raw });
    } else {
      rawInputs.push({ itemId, ratePerMin: raw });
    }
  }

  const byproducts: SolverResult["byproducts"] = [];
  for (const [itemId, amount] of Object.entries(net)) {
    if (targetMap.has(itemId)) {
      const surplus = amount - (targetMap.get(itemId) ?? 0);
      if (surplus > EPS)
        byproducts.push({ itemId, ratePerMin: surplus });
      continue;
    }
    if (available.has(itemId)) continue;
    if (amount > EPS) byproducts.push({ itemId, ratePerMin: amount });
  }

  const totalPowerMW = usage.reduce((s, u) => s + u.powerMW, 0);
  const totalBuildings = usage.reduce((s, u) => s + Math.ceil(u.buildings - EPS), 0);

  usage.sort((a, b) => b.runs - a.runs);
  rawInputs.sort((a, b) => b.ratePerMin - a.ratePerMin);
  missingInputs.sort((a, b) => b.ratePerMin - a.ratePerMin);
  byproducts.sort((a, b) => b.ratePerMin - a.ratePerMin);

  const errors: string[] = [];
  if (missingInputs.length > 0) {
    errors.push(
      `${missingInputs.length} item(s) have all their recipes disabled - re-enable a recipe for each to close the loop.`,
    );
  }

  return {
    feasible: true,
    recipes: usage,
    rawInputs,
    byproducts,
    missingInputs,
    totalPowerMW,
    totalBuildings,
    errors,
  };
}

/** Enumerate all alternate recipes the planner could offer the user. */
export function knownAlternates() {
  return allRecipes()
    .filter((r) => r.alternate && r.inMachine)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Convenience: given the user's currently-enabled alternates, list the items
 * they affect. Useful for showing only the relevant alternates.
 */
export function alternatesProducing(itemId: string) {
  return recipesProducing(itemId)
    .filter((r) => r.alternate && r.inMachine)
    .sort((a, b) => a.name.localeCompare(b.name));
}
