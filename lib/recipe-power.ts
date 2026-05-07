import type { Building, Recipe } from "@/types/game";

/**
 * True when the dataset carries a real min/max power band (Particle Accelerator,
 * some Blender / Converter recipes). SatisfactoryTools often sets maxPower to `1`
 * for ordinary recipes even though draw comes from the building — those must not
 * use this mode.
 */
export function recipeUsesVariablePowerRange(recipe: Recipe): boolean {
  return (
    recipe.isVariablePower &&
    recipe.maxPower > 0 &&
    (recipe.maxPower > 1 || recipe.minPower > 0) &&
    recipe.minPower !== recipe.maxPower
  );
}

/**
 * Peak MW for one machine at 100% clock running this recipe. Uses the building's
 * nominal draw for fixed-power producers; recipe maxPower when the dump marks a
 * real variable-power band or the machine has no nominal consumption (fallback).
 */
export function recipePeakPowerMw(
  recipe: Recipe,
  building: Building | undefined,
): number {
  if (
    recipe.isVariablePower &&
    recipe.maxPower > 0 &&
    (recipe.maxPower > 1 || recipe.minPower > 0)
  ) {
    return recipe.maxPower;
  }

  const b = building?.powerConsumption ?? 0;
  if (b !== 0) {
    return Math.abs(b);
  }

  if (recipe.maxPower > 0) {
    return recipe.maxPower;
  }

  return 0;
}
