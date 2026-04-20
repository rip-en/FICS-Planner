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
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  targets: [],
  enabledAlternates: [],
  disabledRecipes: [],
  objective: "buildings",
  rawCaps: undefined,
};
