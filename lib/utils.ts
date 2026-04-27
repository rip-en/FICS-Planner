import { type ClassValue, clsx } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const formatRate = (n: number, decimals = 2): string => {
  if (!isFinite(n)) return "∞";
  if (Math.abs(n) < 0.005) return "0";
  const s = n.toFixed(decimals);
  return s.replace(/\.?0+$/, "");
};

/** Fractional machine count at 100% clock (e.g. 2.375 machines) with fixed decimals. */
export const formatBuildingsCount = (machines: number, decimals = 3): string => {
  if (!isFinite(machines)) return "∞";
  return machines.toFixed(decimals);
};

/**
 * Fractional machine count at 100% clock, expressed as a % of one such machine
 * (2.5 machines → "250%"). High precision: does not round to 2 decimals like
 * {@link formatRate}.
 */
export const formatBuildingsHundredPercent = (machines: number): string => {
  if (!isFinite(machines)) return "∞%";
  if (Math.abs(machines) < 1e-12) return "0%";
  const pct = machines * 100;
  if (Math.abs(pct) < 1e-9) return "0%";
  const s = pct.toFixed(10).replace(/\.?0+$/, "");
  return `${s}%`;
};

export const formatPower = (watts: number): string => {
  if (Math.abs(watts) >= 1000) return `${(watts / 1000).toFixed(2)} GW`;
  return `${watts.toFixed(1)} MW`;
};
