import type { ClassName } from "@/types/game";

/**
 * Machines that support Somersloop production amplification (see Satisfactory wiki:
 * Production amplifier). Extractors, packagers, and similar are excluded.
 */
export const SOMERSLOOP_COMPATIBLE_BUILDINGS = new Set<ClassName>([
  "Desc_AssemblerMk1_C",
  "Desc_Blender_C",
  "Desc_ConstructorMk1_C",
  "Desc_Converter_C",
  "Desc_FoundryMk1_C",
  "Desc_HadronCollider_C",
  "Desc_ManufacturerMk1_C",
  "Desc_OilRefinery_C",
  "Desc_QuantumEncoder_C",
  "Desc_SmelterMk1_C",
]);

const EPS = 1e-9;

/**
 * Production amplification: same inputs per cycle, more output, higher power.
 *
 * @param amplification Fraction of Somersloop slots filled (0–1), treated uniformly
 *   for every amplifiable building type (e.g. 1 = all slots filled → +100% output).
 * @returns Multipliers applied to recipe output rates and to building power draw.
 */
export function somersloopRecipeMultipliers(
  producedInBuildingId: ClassName | undefined,
  amplification: number | undefined,
): { output: number; power: number } {
  const f =
    amplification === undefined || !Number.isFinite(amplification)
      ? 0
      : Math.min(1, Math.max(0, amplification));
  if (
    f <= EPS ||
    !producedInBuildingId ||
    !SOMERSLOOP_COMPATIBLE_BUILDINGS.has(producedInBuildingId)
  ) {
    return { output: 1, power: 1 };
  }
  const m = 1 + f;
  return { output: m, power: m * m };
}
