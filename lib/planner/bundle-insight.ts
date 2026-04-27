import { recipesProducing } from "@/lib/data";
import type { Recipe } from "@/types/game";
import { getActiveRecipesForPlanner, solvePlan } from "@/lib/planner/solver";
import type {
  PlannerConfig,
  PlannerTarget,
  SolverResult,
} from "@/lib/planner/types";

const EPS = 1e-5;
const MAX_SCALE = 1_000_000;
const BINARY_STEPS = 45;
const BELT_SNAP_ITERS = 48;
/** Default Satisfactory belt “nice” step in items/min (Mk.1 = 60). */
export const DEFAULT_BELT_SNAP_STEP_PER_MIN = 60;

/** Order producers for bundle scaling: standard recipes first, then higher output/min for this item. */
export function sortProducersForBundleItem(
  producers: Recipe[],
  itemId: string,
): Recipe[] {
  return [...producers].sort((a, b) => {
    const aAlt = a.alternate ? 1 : 0;
    const bAlt = b.alternate ? 1 : 0;
    if (aAlt !== bAlt) return aAlt - bAlt;
    const ra = a.products.find((x) => x.item === itemId)?.ratePerMin ?? 0;
    const rb = b.products.find((x) => x.item === itemId)?.ratePerMin ?? 0;
    if (rb !== ra) return rb - ra;
    return a.id.localeCompare(b.id);
  });
}

/** Output items/min for one recipe run among currently active planner recipes. */
export function defaultActiveRecipeOutputRate(
  config: PlannerConfig,
  itemId: string,
): number {
  const activeIds = new Set(
    getActiveRecipesForPlanner(config).map((r) => r.id),
  );
  const producers = recipesProducing(itemId).filter((r) => activeIds.has(r.id));
  if (producers.length === 0) return 60;
  const preferred = sortProducersForBundleItem(producers, itemId)[0]!;
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

export interface BundleBeltSnapDetail {
  rates: Record<string, number>;
  scale: number;
  pivotItemId: string;
  pivotRateBefore: number;
  pivotRateAfter: number;
  stepPerMin: number;
  /** Floored belt-line target for the pivot raw (e.g. 120 when actual was 147). */
  targetPivotRate: number;
  /** True when rates already sat on a belt step (no meaningful change). */
  noop: boolean;
}

export interface BundlePerfectRatesSuggestion {
  rates: Record<string, number>;
  scale: number;
  score: number;
}

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

/**
 * Suggested target rates for several end products at once.
 *
 * Without raw caps, returns one "layer" per machine: each target rate equals
 * that item's default active recipe output (one 100% machine).
 *
 * With raw caps, scales that same proportionally until the bundle hits the
 * budget ceiling (max joint scale).
 */
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

function rawRateForItem(result: SolverResult, itemId: string): number {
  return result.rawInputs.find((r) => r.itemId === itemId)?.ratePerMin ?? 0;
}

function pickBeltSnapPivotItemId(
  result: SolverResult,
  cappedItemIds: Set<string>,
): string | null {
  if (result.rawInputs.length === 0) return null;
  const cappedRows = result.rawInputs.filter((r) => cappedItemIds.has(r.itemId));
  const pool = cappedRows.length > 0 ? cappedRows : result.rawInputs;
  pool.sort((a, b) => b.ratePerMin - a.ratePerMin);
  return pool[0]?.itemId ?? null;
}

/**
 * Whether belt snapping is offered for this bundle suggestion.
 * When raw caps exist but never bind at the suggested scale, scaling up to hit
 * a belt line has no natural ceiling — the UI should steer users to Targets
 * instead.
 */
export function canOfferBeltSnap(
  hasRawCaps: boolean,
  suggestion: BundleRateSuggestion,
): boolean {
  if (suggestion.scale <= 0) return false;
  if (hasRawCaps && suggestion.unbounded) return false;
  return true;
}

/**
 * Re-scale the whole bundle (same proportions as “max under caps”) so the
 * dominant raw input sits on a “belt-friendly” step such as 60 / 120 / 180
 * items/min (default step 60).
 *
 * Uses the same joint scale as {@link suggestBundleTargetRates}; snaps the
 * pivot raw **down** to `floor(rate / step) * step` when needed.
 */
export function suggestBundleBeltSnapRates(
  base: PlannerConfig,
  itemIds: string[],
  options: { stepPerMin?: number; suggestion?: BundleRateSuggestion } = {},
): BundleBeltSnapDetail | null {
  const step = options.stepPerMin ?? DEFAULT_BELT_SNAP_STEP_PER_MIN;
  if (!Number.isFinite(step) || step <= EPS) return null;

  const suggestion =
    options.suggestion ?? suggestBundleTargetRates(base, itemIds);
  const hasCaps =
    base.rawCaps !== undefined && Object.keys(base.rawCaps).length > 0;
  if (!canOfferBeltSnap(hasCaps, suggestion)) return null;

  const unique = [...new Set(itemIds.filter(Boolean))];
  if (unique.length === 0) return null;

  const baseRates = unique.map((id) => defaultActiveRecipeOutputRate(base, id));
  const cappedIds = new Set(Object.keys(base.rawCaps ?? {}));

  const buildRates = (scale: number): Record<string, number> => {
    const rates: Record<string, number> = {};
    unique.forEach((id, i) => {
      rates[id] = +(scale * baseRates[i]).toFixed(4);
    });
    return rates;
  };

  const kRef = suggestion.scale;
  const resRef = solvePlan(jointConfig(base, unique, kRef, baseRates));
  if (!resRef.feasible) return null;

  const pivotId = pickBeltSnapPivotItemId(resRef, cappedIds);
  if (!pivotId) return null;

  const before = rawRateForItem(resRef, pivotId);
  if (before <= EPS) return null;

  const flooredTarget = Math.floor(before / step) * step;
  if (flooredTarget < step - EPS) return null;

  const target = flooredTarget;
  const alreadyNice = Math.abs(before - target) < 0.05;
  if (alreadyNice) {
    return {
      rates: buildRates(kRef),
      scale: kRef,
      pivotItemId: pivotId,
      pivotRateBefore: before,
      pivotRateAfter: before,
      stepPerMin: step,
      targetPivotRate: target,
      noop: true,
    };
  }

  const pivotRawAtScale = (k: number): { feasible: boolean; raw: number } => {
    const res = solvePlan(jointConfig(base, unique, k, baseRates));
    if (!res.feasible) return { feasible: false, raw: 0 };
    return { feasible: true, raw: rawRateForItem(res, pivotId) };
  };

  let lo = EPS;
  let hi = kRef;
  const probe = pivotRawAtScale(lo);
  if (!probe.feasible || probe.raw > target + 1e-3) return null;

  for (let i = 0; i < BELT_SNAP_ITERS; i++) {
    const mid = (lo + hi) / 2;
    const p = pivotRawAtScale(mid);
    if (!p.feasible) {
      hi = mid;
      continue;
    }
    if (p.raw <= target + 1e-3) lo = mid;
    else hi = mid;
  }

  const kStar = lo;
  const resStar = solvePlan(jointConfig(base, unique, kStar, baseRates));
  if (!resStar.feasible) return null;

  const after = rawRateForItem(resStar, pivotId);

  return {
    rates: buildRates(kStar),
    scale: kStar,
    pivotItemId: pivotId,
    pivotRateBefore: before,
    pivotRateAfter: after,
    stepPerMin: step,
    targetPivotRate: target,
    noop: Math.abs(after - before) < 0.05,
  };
}

const NICE_RAW_STEPS_PER_MIN = [180, 120, 100, 60, 50, 30] as const;
/** How strongly total byproduct rate (excess) factors vs. “nice” rate penalties. */
const PERFECT_EXCESS_WEIGHT = 0.1;
const PERFECT_SEARCH_POINTS = 32;
/** When the bundle has no raw-cap ceiling, search this multiplicative band around scale 1. */
const PERFECT_UNBOUNDED_MIN_SCALE = 0.15;
const PERFECT_UNBOUNDED_MAX_SCALE = 12;

function nearestStepDistance(value: number, step: number): number {
  if (value <= EPS || step <= EPS) return 0;
  const k = Math.max(1, Math.round(value / step));
  return Math.abs(value - k * step);
}

function niceNumberPenalty(value: number): number {
  if (value <= EPS) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const step of NICE_RAW_STEPS_PER_MIN) {
    const dist = nearestStepDistance(value, step);
    if (dist < best) best = dist;
  }
  return best;
}

function perfectScoreForScale(
  base: PlannerConfig,
  itemIds: string[],
  baseRates: number[],
  scale: number,
): number | null {
  // Match the path users apply (“raw” objective) so rates reflect the same solve.
  const plan = solvePlan({
    ...base,
    objective: "raw",
    targets: itemIds.map((id, i) => ({
      itemId: id,
      rate: scale * (baseRates[i] ?? 1),
    })),
  });
  if (!plan.feasible) return null;

  const rawPenalty = plan.rawInputs.reduce(
    (sum, row) => sum + niceNumberPenalty(row.ratePerMin),
    0,
  );
  const outputPenalty = itemIds.reduce((sum, _, idx) => {
    const outputRate = scale * (baseRates[idx] ?? 1);
    return sum + niceNumberPenalty(outputRate);
  }, 0);
  const excessPenalty = plan.byproducts.reduce(
    (sum, row) => sum + row.ratePerMin,
    0,
  );

  return (
    rawPenalty +
    outputPenalty +
    excessPenalty * PERFECT_EXCESS_WEIGHT
  );
}

/**
 * Suggest a bundle scale where raw draw and bundle targets both sit near
 * “nice” throughput steps (180/120/100/60/50/30 per min), using a raw-objective
 * solve and preferring scales with less total byproduct (excess) flow.
 */
export function suggestBundlePerfectRates(
  base: PlannerConfig,
  itemIds: string[],
): BundlePerfectRatesSuggestion | null {
  const unique = [...new Set(itemIds.filter(Boolean))];
  if (unique.length === 0) return null;

  const baseRates = unique.map((id) => defaultActiveRecipeOutputRate(base, id));
  const bound = suggestBundleTargetRates(base, unique);

  let upper: number;
  let lower: number;
  if (bound.unbounded) {
    upper = PERFECT_UNBOUNDED_MAX_SCALE;
    lower = PERFECT_UNBOUNDED_MIN_SCALE;
  } else {
    upper = Math.max(bound.scale, EPS);
    lower = Math.max(EPS, Math.min(upper * 0.02, upper * 0.1));
  }
  if (upper <= EPS) return null;

  let bestScale = Math.max(EPS, bound.scale > EPS ? bound.scale : 1);
  let bestScore = Number.POSITIVE_INFINITY;

  const candidates = new Set<number>([
    Math.max(EPS, bestScale),
    1,
    upper,
    lower,
    0.5,
    2,
    4,
  ]);
  for (let i = 0; i <= PERFECT_SEARCH_POINTS; i++) {
    const t = i / PERFECT_SEARCH_POINTS;
    candidates.add(lower + (upper - lower) * t);
  }

  for (const scale of candidates) {
    if (scale < EPS || scale > upper + EPS) continue;
    const score = perfectScoreForScale(base, unique, baseRates, scale);
    if (score === null) continue;
    if (score < bestScore) {
      bestScore = score;
      bestScale = scale;
    }
  }

  if (!Number.isFinite(bestScore)) return null;

  const rates: Record<string, number> = {};
  unique.forEach((id, i) => {
    rates[id] = +(bestScale * baseRates[i]).toFixed(4);
  });

  return {
    rates,
    scale: bestScale,
    score: bestScore,
  };
}
