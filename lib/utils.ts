import { type ClassValue, clsx } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const formatRate = (n: number, decimals = 2): string => {
  if (!isFinite(n)) return "∞";
  if (Math.abs(n) < 0.005) return "0";
  const s = n.toFixed(decimals);
  return s.replace(/\.?0+$/, "");
};

export const formatPower = (watts: number): string => {
  if (Math.abs(watts) >= 1000) return `${(watts / 1000).toFixed(2)} GW`;
  return `${watts.toFixed(1)} MW`;
};
