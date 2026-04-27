export interface PlannerTarget {
  itemId: string;
  rate: number;
}

export interface RecipeUsage {
  recipeId: string;
  runs: number;
  buildings: number;
  buildingId?: string;
  powerMW: number;
  inputs: Array<{ itemId: string; ratePerMin: number }>;
  outputs: Array<{ itemId: string; ratePerMin: number }>;
}

export interface SolverResult {
  feasible: boolean;
  recipes: RecipeUsage[];
  rawInputs: Array<{ itemId: string; ratePerMin: number }>;
  providedInputs: Array<{ itemId: string; ratePerMin: number }>;
  byproducts: Array<{ itemId: string; ratePerMin: number }>;
  missingInputs: Array<{ itemId: string; ratePerMin: number }>;
  totalPowerMW: number;
  totalBuildings: number;
  errors: string[];
}

export interface PlannerConfig {
  targets: PlannerTarget[];
  enabledAlternates: string[];
  disabledRecipes: string[];
  objective: "buildings" | "raw";
  /**
   * Max supply rate (items/min) for listed raw or “free source” items.
   * Items not listed remain unlimited. Used by the solver and inventory insight.
   */
  rawCaps?: Record<string, number>;
  /**
   * Raw inputs the planner is not allowed to source at all.
   * Useful for banning resources you do not want in this factory.
   */
  excludedRawInputs?: string[];
  /**
   * Inputs you already make elsewhere and want treated as free in this plan.
   * Unlike excluded raws, these can be any item (intermediate or raw).
   */
  providedInputs?: string[];
  /**
   * Per-alternate input multipliers (1 = default recipe values).
   * Lets you experiment with custom alternate ingredient ratios.
   */
  alternateInputRatios?: Record<string, number>;
  /**
   * Highest hub (milestone) tier you have completed. When set, machine recipes
   * unlocked only at a higher milestone tier are excluded from the planner.
   */
  maxCompletedHubTier?: number;
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  targets: [],
  enabledAlternates: [],
  disabledRecipes: [],
  objective: "buildings",
  rawCaps: undefined,
  excludedRawInputs: undefined,
  providedInputs: undefined,
  alternateInputRatios: undefined,
};
