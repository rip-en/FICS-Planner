import type { PlannerConfig } from "@/lib/planner/types";
import { DEFAULT_PLANNER_CONFIG } from "@/lib/planner/types";
import type { SavedPlan } from "@/lib/store/planner-store";

export const PLAN_IMPORT_MAX_PLANS = 80;
export const PLAN_IMPORT_MAX_NAME_LEN = 120;
export const PLAN_IMPORT_MAX_TARGETS = 200;
export const PLAN_IMPORT_MAX_ALTERNATES = 500;
export const PLAN_IMPORT_MAX_FILE_BYTES = 2_000_000;

export interface PlanImportPayload {
  version: 1;
  plans: Record<string, SavedPlan>;
  activePlanId: string;
}

export type PlanImportResult =
  | { ok: true; data: PlanImportPayload }
  | { ok: false; error: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function asFiniteNumber(x: unknown): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  return x;
}

function normalizeConfig(raw: unknown): PlannerConfig | null {
  if (!isRecord(raw)) return null;
  const targetsRaw = raw.targets;
  if (!Array.isArray(targetsRaw)) return null;
  if (targetsRaw.length > PLAN_IMPORT_MAX_TARGETS) return null;

  const targets: PlannerConfig["targets"] = [];
  for (const t of targetsRaw) {
    if (!isRecord(t)) return null;
    const itemId = t.itemId;
    const rate = asFiniteNumber(t.rate);
    if (typeof itemId !== "string" || itemId.length === 0 || itemId.length > 200)
      return null;
    if (rate === null || rate < 0 || rate > 1e9) return null;
    targets.push({ itemId, rate });
  }

  const enabledRaw = raw.enabledAlternates;
  const disabledRaw = raw.disabledRecipes;
  if (!Array.isArray(enabledRaw) || !Array.isArray(disabledRaw)) return null;
  if (
    enabledRaw.length > PLAN_IMPORT_MAX_ALTERNATES ||
    disabledRaw.length > PLAN_IMPORT_MAX_ALTERNATES
  ) {
    return null;
  }
  const enabledAlternates: string[] = [];
  const disabledRecipes: string[] = [];
  for (const id of enabledRaw) {
    if (typeof id !== "string" || id.length === 0 || id.length > 200) return null;
    enabledAlternates.push(id);
  }
  for (const id of disabledRaw) {
    if (typeof id !== "string" || id.length === 0 || id.length > 200) return null;
    disabledRecipes.push(id);
  }

  const objective = raw.objective;
  if (objective !== "buildings" && objective !== "raw") return null;

  const next: PlannerConfig = {
    ...DEFAULT_PLANNER_CONFIG,
    targets,
    enabledAlternates,
    disabledRecipes,
    objective,
  };

  const rawCaps = raw.rawCaps;
  if (rawCaps !== undefined) {
    if (!isRecord(rawCaps)) return null;
    const caps: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawCaps)) {
      if (k.length > 200) return null;
      const n = asFiniteNumber(v);
      if (n === null || n < 0 || n > 1e9) return null;
      caps[k] = n;
    }
    next.rawCaps = Object.keys(caps).length ? caps : undefined;
  }

  const excludedRaw = raw.excludedRawInputs;
  if (excludedRaw !== undefined) {
    if (!Array.isArray(excludedRaw)) return null;
    if (excludedRaw.length > PLAN_IMPORT_MAX_ALTERNATES) return null;
    const xs: string[] = [];
    for (const id of excludedRaw) {
      if (typeof id !== "string" || id.length === 0 || id.length > 200)
        return null;
      xs.push(id);
    }
    next.excludedRawInputs = xs.length ? xs : undefined;
  }

  const provided = raw.providedInputs;
  if (provided !== undefined) {
    if (!Array.isArray(provided)) return null;
    if (provided.length > PLAN_IMPORT_MAX_ALTERNATES) return null;
    const xs: string[] = [];
    for (const id of provided) {
      if (typeof id !== "string" || id.length === 0 || id.length > 200)
        return null;
      xs.push(id);
    }
    next.providedInputs = xs.length ? xs : undefined;
  }

  const ratios = raw.alternateInputRatios;
  if (ratios !== undefined) {
    if (!isRecord(ratios)) return null;
    const r: Record<string, number> = {};
    for (const [k, v] of Object.entries(ratios)) {
      if (k.length > 200) return null;
      const n = asFiniteNumber(v);
      if (n === null || n <= 0 || n > 1e6) return null;
      r[k] = n;
    }
    next.alternateInputRatios = Object.keys(r).length ? r : undefined;
  }

  const hub = raw.maxCompletedHubTier;
  if (hub !== undefined) {
    if (typeof hub !== "number" || !Number.isInteger(hub) || hub < 0 || hub > 99) {
      return null;
    }
    next.maxCompletedHubTier = hub;
  }

  return next;
}

function normalizePlan(id: string, raw: unknown): SavedPlan | null {
  if (!isRecord(raw)) return null;
  const name = raw.name;
  if (typeof name !== "string" || name.length === 0 || name.length > PLAN_IMPORT_MAX_NAME_LEN)
    return null;
  const updatedAt = asFiniteNumber(raw.updatedAt);
  if (updatedAt === null || updatedAt < 0) return null;
  const config = normalizeConfig(raw.config);
  if (!config) return null;
  if (typeof raw.id === "string" && raw.id.length > 0 && raw.id !== id) {
    return null;
  }
  return { id, name, config, updatedAt };
}

/** Validate exported JSON before replacing local planner state. */
export function validatePlanImportJson(text: string): PlanImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "Import file must be a JSON object." };
  }

  if (parsed.version !== 1) {
    return { ok: false, error: "Unsupported export version (expected version 1)." };
  }

  const plansRaw = parsed.plans;
  if (!isRecord(plansRaw)) {
    return { ok: false, error: "Missing or invalid \"plans\" object." };
  }

  const planIds = Object.keys(plansRaw);
  if (planIds.length === 0) {
    return { ok: false, error: "No plans found in file." };
  }
  if (planIds.length > PLAN_IMPORT_MAX_PLANS) {
    return {
      ok: false,
      error: `Too many plans (max ${PLAN_IMPORT_MAX_PLANS}).`,
    };
  }

  const plans: Record<string, SavedPlan> = {};
  for (const id of planIds) {
    if (typeof id !== "string" || id.length === 0 || id.length > 200) {
      return { ok: false, error: "Invalid plan id in import file." };
    }
    const plan = normalizePlan(id, plansRaw[id]);
    if (!plan) {
      const label = id.length > 48 ? `${id.slice(0, 48)}…` : id;
      return { ok: false, error: `Invalid plan data for "${label}".` };
    }
    plans[id] = plan;
  }

  const activeRaw = parsed.activePlanId;
  if (typeof activeRaw !== "string" || !plans[activeRaw]) {
    const fallback = planIds[0]!;
    return {
      ok: true,
      data: { version: 1, plans, activePlanId: fallback },
    };
  }

  return {
    ok: true,
    data: { version: 1, plans, activePlanId: activeRaw },
  };
}
