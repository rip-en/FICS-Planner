import LpSolver from "javascript-lp-solver";
import {
  allRecipes,
  buildings as buildingsMap,
  getBuilding,
  items as itemsMap,
  recipesProducing,
} from "@/lib/data";
import type { Recipe } from "@/types/game";
import { sortRecipeUsagesByProductionFlow } from "./production-flow";
import type { PlannerConfig, SolverResult } from "./types";

/** Hub tier is 0-based in dataset schematics (e.g. tier 9 = endgame). */
export const HUB_TIER_MAX = 9;

export function recipePassesHubMilestoneGate(
  r: Recipe,
  maxCompletedHubTier: number | undefined,
): boolean {
  if (maxCompletedHubTier === undefined) return true;
  const u = r.unlockedBy;
  if (u.source !== "milestone") return true;
  if (u.tier === undefined) return true;
  return u.tier <= maxCompletedHubTier;
}

interface RawModel {
  optimize: string;
  opType: "min" | "max";
  constraints: Record<string, { min?: number; max?: number; equal?: number }>;
  variables: Record<string, Record<string, number>>;
}

const EPS = 1e-6;
const BUILDING_OBJECTIVE_RAW_TIEBREAKER_COST = 1e-8;
const BALANCE_TOL = 0.01;

/**
 * Scales alternate recipe ingredient draw when the user set a custom ratio.
 * Used consistently in the LP, usage rows, and post-solve validation.
 */
export function alternateIngredientScale(
  recipe: { id: string; alternate: boolean },
  alternateInputRatios: Record<string, number> | undefined,
): number {
  if (
    !recipe.alternate ||
    !alternateInputRatios ||
    !Number.isFinite(alternateInputRatios[recipe.id]!)
  ) {
    return 1;
  }
  return Math.max(alternateInputRatios[recipe.id]!, EPS);
}

function totalItemRateFromPlan(
  result: SolverResult,
  itemId: string,
): number {
  let b = 0;
  for (const u of result.recipes) {
    for (const o of u.outputs) {
      if (o.itemId === itemId) b += o.ratePerMin;
    }
    for (const i of u.inputs) {
      if (i.itemId === itemId) b -= i.ratePerMin;
    }
  }
  b += result.rawInputs.find((r) => r.itemId === itemId)?.ratePerMin ?? 0;
  b += result.providedInputs.find((r) => r.itemId === itemId)?.ratePerMin ?? 0;
  return b;
}

/**
 * Catches rare LP numeric drift or hand-off bugs (balance should always hold).
 */
function collectMaterialImbalanceErrors(
  result: SolverResult,
  config: PlannerConfig,
  referenced: Set<string>,
  targetMap: Map<string, number>,
  available: Set<string>,
  excludedRawInputs: Set<string>,
): string[] {
  const warn: string[] = [];
  for (const itemId of referenced) {
    if (excludedRawInputs.has(itemId)) {
      const min = targetMap.get(itemId) ?? 0;
      const b = totalItemRateFromPlan(result, itemId);
      if (b < min - BALANCE_TOL) {
        warn.push(
          `Material check: "${itemId}" net rate ${b.toFixed(4)}/min is below required ${min} (internal solver check).`,
        );
      }
      continue;
    }
    if (available.has(itemId) && !targetMap.has(itemId)) continue;
    const min = targetMap.get(itemId) ?? 0;
    const b = totalItemRateFromPlan(result, itemId);
    if (b < min - BALANCE_TOL) {
      warn.push(
        `Material check: "${itemId}" net rate ${b.toFixed(4)}/min is below required ${min} (internal solver check).`,
      );
    }
  }
  return warn;
}

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
  const excludedRawInputs = new Set(config.excludedRawInputs ?? []);
  return allRecipes().filter((r) => {
    if (!r.inMachine || r.forBuilding) return false;
    if (disabled.has(r.id)) return false;
    if (r.alternate && !enabled.has(r.id)) return false;
    if (!recipePassesHubMilestoneGate(r, config.maxCompletedHubTier)) {
      return false;
    }
    if (
      r.products.some((p) => excludedRawInputs.has(p.item)) ||
      r.ingredients.some((i) => excludedRawInputs.has(i.item))
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Partition the "free to source" pool the LP uses to stay feasible:
 *
 *  - `raw`: items that are actually extraction-only (raw resources) OR
 *    foraged/drop-only items that have no recipe anywhere in the data
 *    (Mycelia, Leaves, Wood, Power Shards, Hard Drives, ...). Raw resources
 *    stay here even if they have an optional machine line (e.g. SAM
 *    reanimation) that you disabled—those remain raw inputs, not “missing”.
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
    if (itemsMap[id]?.isRaw) continue;

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
  const providedInputs = new Set(config.providedInputs ?? []);

  if (config.targets.length === 0 || recipes.length === 0) {
    return {
      feasible: true,
      recipes: [],
      rawInputs: [],
      providedInputs: [],
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
  const excludedRawInputs = new Set(config.excludedRawInputs ?? []);
  const alternateInputRatios = config.alternateInputRatios ?? {};

  // Constraint for each non-raw referenced item: net output >= target (or 0).
  for (const itemId of referenced) {
    if (excludedRawInputs.has(itemId)) {
      // Banned raws: no `raw:item` source; require net from recipes (and
      // provided) to meet targets / stay non-negative — never "equal: 0"
      // (that forbids any surplus and breaks normal chains).
      const target = targetMap.get(itemId) ?? 0;
      model.constraints[itemId] = { min: target };
      continue;
    }
    if (available.has(itemId) && !targetMap.has(itemId)) continue;
    const target = targetMap.get(itemId) ?? 0;
    model.constraints[itemId] = { min: target };
  }
  for (const itemId of providedInputs) {
    if (targetMap.has(itemId)) continue;
    if (!referenced.has(itemId)) continue;
    if (!model.constraints[itemId]) model.constraints[itemId] = { min: 0 };
    model.variables[`provided:${itemId}`] = { [itemId]: 1, cost: 0 };
  }

  // One variable per active recipe; one extra variable per available item
  // that we use as a "raw sink" so the solver can source them freely.
  const objective = config.objective;

  for (const r of recipes) {
    const v: Record<string, number> = {};
    for (const out of r.products) {
      v[out.item] = (v[out.item] ?? 0) + out.ratePerMin;
    }
    const ingredientRatio = alternateIngredientScale(r, alternateInputRatios);
    for (const inp of r.ingredients) {
      v[inp.item] = (v[inp.item] ?? 0) - inp.ratePerMin * ingredientRatio;
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
    if (pool.raw.has(itemId) && excludedRawInputs.has(itemId)) continue;
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
    } else if (objective === "raw") {
      v.cost = 1;
    } else {
      // For "buildings", keep building-count minimization as the primary goal,
      // but use raw intake as a tiny tie-breaker so enabling an alternate does
      // not implicitly force it when a lower-raw option exists at equal runs.
      v.cost = BUILDING_OBJECTIVE_RAW_TIEBREAKER_COST;
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
      providedInputs: [],
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
    const ratio = alternateIngredientScale(r, alternateInputRatios);
    usage.push({
      recipeId: r.id,
      runs,
      buildings: runs,
      buildingId: r.producedIn[0],
      powerMW: runs * powerPerRun,
      inputs: r.ingredients.map((i) => ({
        itemId: i.item,
        ratePerMin: i.ratePerMin * ratio * runs,
      })),
      outputs: r.products.map((p) => ({
        itemId: p.item,
        ratePerMin: p.ratePerMin * runs,
      })),
    });
    for (const p of r.products) net[p.item] = (net[p.item] ?? 0) + p.ratePerMin * runs;
    for (const i of r.ingredients) {
      net[i.item] = (net[i.item] ?? 0) - i.ratePerMin * ratio * runs;
    }
  }

  const rawInputs: SolverResult["rawInputs"] = [];
  const providedInputUsage: SolverResult["providedInputs"] = [];
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
  for (const itemId of Array.from(referenced)) {
    const provided = solved[`provided:${itemId}`] ?? 0;
    if (provided <= EPS) continue;
    providedInputUsage.push({ itemId, ratePerMin: provided });
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

  const recipeUsagesOrdered = sortRecipeUsagesByProductionFlow(usage);
  rawInputs.sort((a, b) => b.ratePerMin - a.ratePerMin);
  providedInputUsage.sort((a, b) => b.ratePerMin - a.ratePerMin);
  missingInputs.sort((a, b) => b.ratePerMin - a.ratePerMin);
  byproducts.sort((a, b) => b.ratePerMin - a.ratePerMin);

  const resultStub: SolverResult = {
    feasible: true,
    recipes: recipeUsagesOrdered,
    rawInputs,
    providedInputs: providedInputUsage,
    byproducts,
    missingInputs,
    totalPowerMW,
    totalBuildings,
    errors: [],
  };

  const errors: string[] = collectMaterialImbalanceErrors(
    resultStub,
    config,
    referenced,
    targetMap,
    available,
    excludedRawInputs,
  );
  if (missingInputs.length > 0) {
    errors.push(
      `${missingInputs.length} item(s) have all their recipes disabled - re-enable a recipe for each to close the loop.`,
    );
  }

  return {
    ...resultStub,
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
