import { allItems, recipesProducing } from "@/lib/data";
import { getActiveRecipesForPlanner, solvePlan } from "@/lib/planner/solver";
import type { PlannerConfig, SolverResult } from "@/lib/planner/types";

/** Items reachable in the recipe graph from user-capped inputs (forward closure). */
export function itemsDownstreamOfCaps(config: PlannerConfig): Set<string> {
  const caps = config.rawCaps ?? {};
  const seeds = Object.keys(caps);
  const reach = new Set<string>(seeds);
  const recipes = getActiveRecipesForPlanner(config);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of recipes) {
      if (!r.ingredients.some((i) => reach.has(i.item))) continue;
      for (const p of r.products) {
        if (!reach.has(p.item)) {
          reach.add(p.item);
          changed = true;
        }
      }
    }
  }
  return reach;
}

const EPS = 1e-5;
const MAX_RATE = 1_000_000;
const BINARY_STEPS = 45;

function withSingleTarget(
  base: PlannerConfig,
  itemId: string,
  rate: number,
): PlannerConfig {
  return {
    ...base,
    targets: [{ itemId, rate }],
  };
}

/** True if this item can be produced by at least one machine recipe under the plan. */
export function canProduceItem(config: PlannerConfig, itemId: string): boolean {
  const producers = recipesProducing(itemId).filter(
    (r) => r.inMachine && !r.forBuilding,
  );
  if (producers.length === 0) return false;
  return solvePlan(withSingleTarget(config, itemId, EPS)).feasible;
}

function isFeasibleAtRate(
  base: PlannerConfig,
  itemId: string,
  rate: number,
): boolean {
  return solvePlan(withSingleTarget(base, itemId, rate)).feasible;
}

export interface MaximizeTargetResult {
  /** Items/min; Infinity if still feasible at the numeric ceiling (other raws uncapped). */
  maxRate: number;
  result: SolverResult | null;
  unbounded: boolean;
}

/**
 * Maximize output rate of one item given the same recipe toggles and raw caps.
 * Requires at least one raw cap, otherwise production is typically unbounded.
 */
export function maximizeTargetRate(
  base: PlannerConfig,
  itemId: string,
): MaximizeTargetResult {
  const caps = base.rawCaps ?? {};
  if (Object.keys(caps).length === 0) {
    return { maxRate: Infinity, result: null, unbounded: true };
  }

  if (!canProduceItem(base, itemId)) {
    return { maxRate: 0, result: null, unbounded: false };
  }

  let low = 0;
  let high = 1;
  while (high < MAX_RATE && isFeasibleAtRate(base, itemId, high)) {
    low = high;
    high *= 2;
  }

  if (high >= MAX_RATE && isFeasibleAtRate(base, itemId, MAX_RATE)) {
    const result = solvePlan(withSingleTarget(base, itemId, MAX_RATE));
    return { maxRate: Infinity, result, unbounded: true };
  }

  if (!isFeasibleAtRate(base, itemId, high)) {
    for (let i = 0; i < BINARY_STEPS; i++) {
      const mid = (low + high) / 2;
      if (isFeasibleAtRate(base, itemId, mid)) low = mid;
      else high = mid;
    }
  } else {
    low = high;
  }

  const result = solvePlan(withSingleTarget(base, itemId, low));
  return { maxRate: low, result, unbounded: false };
}

export interface SuggestionRow {
  itemId: string;
  maxRate: number;
  unbounded: boolean;
}

export interface ExcessSuggestionRow {
  itemId: string;
  maxAdditionalRate: number;
}

/**
 * Rank machine-craftable items by how much output/min your raw caps allow (single-item factory).
 */
export function suggestAutomatableItems(
  base: PlannerConfig,
  options: { limit?: number } = {},
): SuggestionRow[] {
  const limit = options.limit ?? 25;
  const caps = base.rawCaps ?? {};
  if (Object.keys(caps).length === 0) return [];

  const rows: SuggestionRow[] = [];
  const reachable = itemsDownstreamOfCaps(base);

  let candidates = allItems().filter((it) => {
    if (it.isRaw || !reachable.has(it.id)) return false;
    const producers = recipesProducing(it.id).filter(
      (r) => r.inMachine && !r.forBuilding,
    );
    return producers.length > 0;
  });
  candidates.sort((a, b) => b.sinkPoints - a.sinkPoints);
  if (candidates.length > 80) candidates = candidates.slice(0, 80);

  for (const it of candidates) {
    const { maxRate, unbounded } = maximizeTargetRate(base, it.id);
    if (maxRate <= EPS && !unbounded) continue;

    rows.push({
      itemId: it.id,
      maxRate: unbounded ? MAX_RATE : maxRate,
      unbounded,
    });
  }

  rows.sort((a, b) => b.maxRate - a.maxRate);
  return rows.slice(0, limit);
}

function withAdditionalTarget(
  base: PlannerConfig,
  itemId: string,
  additionalRate: number,
): PlannerConfig {
  const hasExisting = base.targets.some((t) => t.itemId === itemId);
  const targets = hasExisting
    ? base.targets.map((t) =>
        t.itemId === itemId
          ? { ...t, rate: t.rate + additionalRate }
          : t,
      )
    : [...base.targets, { itemId, rate: additionalRate }];
  return {
    ...base,
    targets,
  };
}

function isFeasibleWithAdditionalRate(
  base: PlannerConfig,
  itemId: string,
  additionalRate: number,
): boolean {
  return solvePlan(withAdditionalTarget(base, itemId, additionalRate)).feasible;
}

/**
 * Rank extra products you can add while keeping existing targets satisfied.
 * Useful when capped inputs have remaining headroom after current goals.
 */
export function suggestExcessAutomatableItems(
  base: PlannerConfig,
  options: { limit?: number } = {},
): ExcessSuggestionRow[] {
  const limit = options.limit ?? 15;
  const caps = base.rawCaps ?? {};
  if (Object.keys(caps).length === 0) return [];
  if (base.targets.length === 0) return [];
  if (!solvePlan(base).feasible) return [];

  const targetIds = new Set(base.targets.map((t) => t.itemId));
  const reachable = itemsDownstreamOfCaps(base);

  let candidates = allItems().filter((it) => {
    if (it.isRaw || targetIds.has(it.id) || !reachable.has(it.id)) return false;
    const producers = recipesProducing(it.id).filter(
      (r) => r.inMachine && !r.forBuilding,
    );
    return producers.length > 0;
  });
  candidates.sort((a, b) => b.sinkPoints - a.sinkPoints);
  if (candidates.length > 80) candidates = candidates.slice(0, 80);

  const rows: ExcessSuggestionRow[] = [];
  for (const it of candidates) {
    if (!isFeasibleWithAdditionalRate(base, it.id, EPS)) continue;
    let low = 0;
    let high = 1;
    while (
      high < MAX_RATE &&
      isFeasibleWithAdditionalRate(base, it.id, high)
    ) {
      low = high;
      high *= 2;
    }

    if (!isFeasibleWithAdditionalRate(base, it.id, high)) {
      for (let i = 0; i < BINARY_STEPS; i++) {
        const mid = (low + high) / 2;
        if (isFeasibleWithAdditionalRate(base, it.id, mid)) low = mid;
        else high = mid;
      }
    } else {
      low = high;
    }

    if (low > EPS) rows.push({ itemId: it.id, maxAdditionalRate: low });
  }

  rows.sort((a, b) => b.maxAdditionalRate - a.maxAdditionalRate);
  return rows.slice(0, limit);
}
