import { recipesProducing } from "@/lib/data";
import { getActiveRecipesForPlanner, solvePlan } from "@/lib/planner/solver";
import type { PlannerConfig, PlannerTarget } from "@/lib/planner/types";

const EPS = 1e-5;
const MAX_SCALE = 1_000_000;
const BINARY_STEPS = 45;

/** Output items/min for one recipe run (prefers non-alternate among active producers). */
export function defaultActiveRecipeOutputRate(
  config: PlannerConfig,
  itemId: string,
): number {
  const activeIds = new Set(
    getActiveRecipesForPlanner(config).map((r) => r.id),
  );
  const producers = recipesProducing(itemId).filter((r) => activeIds.has(r.id));
  if (producers.length === 0) return 60;
  const preferred = producers.find((r) => !r.alternate) ?? producers[0];
  const p = preferred.products.find((x) => x.item === itemId);
  const rate = p?.ratePerMin ?? 0;
  return rate > EPS ? rate : 60;
}

function jointConfig(
  base: PlannerConfig,
  itemIds: string[],
  scale: number,
  baseRates: number[],
): PlannerConfig {
  const targets: PlannerTarget[] = itemIds.map((id, i) => ({
    itemId: id,
    rate: scale * (baseRates[i] ?? 1),
  }));
  return { ...base, targets };
}

function isJointFeasible(
  base: PlannerConfig,
  itemIds: string[],
  scale: number,
  baseRates: number[],
): boolean {
  return solvePlan(jointConfig(base, itemIds, scale, baseRates)).feasible;
}

export interface BundleRateSuggestion {
  /** Per-item production targets (items/min). */
  rates: Record<string, number>;
  /** Multiplier applied to each machine's default output rate. */
  scale: number;
  /** True when there are no raw caps (any finite scale is feasible). */
  unbounded: boolean;
  /** True if scale 1 (one "layer" of each machine output) is not feasible. */
  infeasibleAtUnitScale: boolean;
}

/**
 * Suggested target rates for several end products at once.
 *
 * Without raw caps, returns one "layer" per machine: each target rate equals
 * that item's default active recipe output (one 100% machine).
 *
 * With raw caps, scales that same proportionally until the bundle hits the
 * budget ceiling (max joint scale).
 */
/** Target rates matching one 100% machine of each item's preferred active recipe. */
export function oneMachineLayerRates(
  config: PlannerConfig,
  itemIds: string[],
): Record<string, number> {
  const unique = [...new Set(itemIds.filter(Boolean))];
  const rates: Record<string, number> = {};
  for (const id of unique) {
    rates[id] = +defaultActiveRecipeOutputRate(config, id).toFixed(4);
  }
  return rates;
}

export function suggestBundleTargetRates(
  base: PlannerConfig,
  itemIds: string[],
): BundleRateSuggestion {
  const unique = [...new Set(itemIds.filter(Boolean))];
  const empty: BundleRateSuggestion = {
    rates: {},
    scale: 1,
    unbounded: true,
    infeasibleAtUnitScale: false,
  };
  if (unique.length === 0) return empty;

  const baseRates = unique.map((id) => defaultActiveRecipeOutputRate(base, id));
  const caps = base.rawCaps ?? {};
  const hasCaps = Object.keys(caps).length > 0;

  const buildRates = (scale: number): Record<string, number> => {
    const rates: Record<string, number> = {};
    unique.forEach((id, i) => {
      rates[id] = +(scale * baseRates[i]).toFixed(4);
    });
    return rates;
  };

  const unitOk = isJointFeasible(base, unique, 1, baseRates);
  if (!hasCaps) {
    return {
      rates: buildRates(1),
      scale: 1,
      unbounded: true,
      infeasibleAtUnitScale: !unitOk,
    };
  }

  if (!unitOk) {
    if (!isJointFeasible(base, unique, EPS, baseRates)) {
      return {
        rates: buildRates(0),
        scale: 0,
        unbounded: false,
        infeasibleAtUnitScale: true,
      };
    }
    let lo = EPS;
    let hi = 1;
    for (let i = 0; i < BINARY_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (isJointFeasible(base, unique, mid, baseRates)) lo = mid;
      else hi = mid;
    }
    return {
      rates: buildRates(lo),
      scale: lo,
      unbounded: false,
      infeasibleAtUnitScale: true,
    };
  }

  let low = 0;
  let high = 1;
  while (high < MAX_SCALE && isJointFeasible(base, unique, high, baseRates)) {
    low = high;
    high *= 2;
  }

  if (high >= MAX_SCALE && isJointFeasible(base, unique, MAX_SCALE, baseRates)) {
    return {
      rates: buildRates(1),
      scale: 1,
      unbounded: true,
      infeasibleAtUnitScale: false,
    };
  }

  if (!isJointFeasible(base, unique, high, baseRates)) {
    for (let i = 0; i < BINARY_STEPS; i++) {
      const mid = (low + high) / 2;
      if (isJointFeasible(base, unique, mid, baseRates)) low = mid;
      else high = mid;
    }
  } else {
    low = high;
  }

  return {
    rates: buildRates(low),
    scale: low,
    unbounded: false,
    infeasibleAtUnitScale: false,
  };
}
