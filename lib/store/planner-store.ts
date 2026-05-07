"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { useStore } from "zustand";
import { persist } from "zustand/middleware";
import type { StoreApi } from "zustand";
import type { TemporalState } from "zundo";
import { temporal } from "zundo";
import { knownAlternates } from "@/lib/planner/solver";
import type { PlannerConfig, PlannerTarget } from "@/lib/planner/types";
import { DEFAULT_PLANNER_CONFIG } from "@/lib/planner/types";

const EMPTY_TARGETS: PlannerTarget[] = [];

export interface SavedPlan {
  id: string;
  name: string;
  config: PlannerConfig;
  updatedAt: number;
}

interface PlannerState {
  activePlanId: string;
  plans: Record<string, SavedPlan>;
  addTarget: (itemId: string, rate?: number) => void;
  /** Add or replace a single target in one update (avoids stale reads when batching). */
  upsertTarget: (itemId: string, rate: number) => void;
  removeTarget: (itemId: string) => void;
  setTargetRate: (itemId: string, rate: number) => void;
  toggleAlternate: (recipeId: string) => void;
  /** Enable every alternate recipe the planner knows about (machine alternates). */
  enableAllAlternates: () => void;
  /** Disable every alternate recipe for the planner. */
  disableAllAlternates: () => void;
  toggleDisabled: (recipeId: string) => void;
  /** Lock an item to a single recipe: enable it if alternate, disable every
   * competing producer for each of its products. */
  useOnlyThisRecipe: (recipeId: string, competitorIds: string[]) => void;
  setObjective: (obj: PlannerConfig["objective"]) => void;
  /** Max supply items/min for this raw; null removes the cap. */
  setRawCap: (itemId: string, ratePerMin: number | null) => void;
  /** Exclude a raw input from planner sourcing (or include it back). */
  setRawExcluded: (itemId: string, excluded: boolean) => void;
  /** Mark any item as externally provided (already made elsewhere). */
  setProvidedInput: (itemId: string, provided: boolean) => void;
  /**
   * External supply rate (items/min) for an item, or null to clear.
   * Setting a cap removes full "unlimited" omit for that item.
   */
  setProvidedInputCap: (itemId: string, ratePerMin: number | null) => void;
  /** Set custom alternate-recipe input multiplier (1 = default). */
  setAlternateInputRatio: (recipeId: string, ratio: number) => void;
  /**
   * Limit planner to hub milestone recipes through this tier (undefined = no limit).
   */
  setMaxCompletedHubTier: (tier: number | undefined) => void;
  /** 0–1 fraction of Somersloop slots filled on amplifiable machines; undefined = off. */
  setSomersloopAmplification: (fraction: number | undefined) => void;
  clearRawCaps: () => void;
  clearTargets: () => void;
  clearRecipeOverrides: () => void;
  renamePlan: (name: string) => void;
  newPlan: () => string;
  switchPlan: (id: string) => void;
  deletePlan: (id: string) => void;
  replacePlans: (plans: Record<string, SavedPlan>, activePlanId: string) => void;
  /** Per-plan checklist: recipe IDs marked “built” in the Recipes in use table. */
  recipeBuildProgressByPlanId: Record<string, string[]>;
  toggleRecipeBuildProgress: (recipeId: string) => void;
}

type PlannerTemporalSlice = Pick<PlannerState, "plans" | "activePlanId">;

const nid = () => Math.random().toString(36).slice(2, 10);

const makePlan = (
  name = "Untitled plan",
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
  id: string = nid(),
): SavedPlan => ({
  id,
  name,
  config: { ...config },
  updatedAt: 0,
});

// Stable default plan so the first SSR render matches the initial client
// render before Zustand rehydrates from localStorage.
const initialPlan = makePlan("My factory", DEFAULT_PLANNER_CONFIG, "default");

export const usePlannerStore = create<PlannerState>()(
  persist(
    temporal(
      (set, get, store) => ({
      activePlanId: initialPlan.id,
      plans: { [initialPlan.id]: initialPlan },
      recipeBuildProgressByPlanId: {},

      toggleRecipeBuildProgress: (recipeId) =>
        set((state) => {
          const planId = state.activePlanId;
          const prev = state.recipeBuildProgressByPlanId[planId] ?? [];
          const nextSet = new Set(prev);
          if (nextSet.has(recipeId)) nextSet.delete(recipeId);
          else nextSet.add(recipeId);
          const nextArr = Array.from(nextSet);
          const nextMap = { ...state.recipeBuildProgressByPlanId };
          if (nextArr.length === 0) delete nextMap[planId];
          else nextMap[planId] = nextArr;
          return { recipeBuildProgressByPlanId: nextMap };
        }),

      addTarget: (itemId, rate = 60) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          if (plan.config.targets.some((t) => t.itemId === itemId)) return {};
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              targets: [...plan.config.targets, { itemId, rate }],
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      upsertTarget: (itemId, rate) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const exists = plan.config.targets.some((t) => t.itemId === itemId);
          const targets = exists
            ? plan.config.targets.map((t) =>
                t.itemId === itemId ? { ...t, rate } : t,
              )
            : [...plan.config.targets, { itemId, rate }];
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: { ...plan.config, targets },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      removeTarget: (itemId) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              targets: plan.config.targets.filter((t) => t.itemId !== itemId),
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      setTargetRate: (itemId, rate) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              targets: plan.config.targets.map((t) =>
                t.itemId === itemId ? { ...t, rate } : t,
              ),
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      toggleAlternate: (recipeId) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const enabled = new Set(plan.config.enabledAlternates);
          if (enabled.has(recipeId)) enabled.delete(recipeId);
          else enabled.add(recipeId);
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              enabledAlternates: Array.from(enabled),
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      enableAllAlternates: () =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const ids = knownAlternates().map((r) => r.id);
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              enabledAlternates: ids,
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      disableAllAlternates: () =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              enabledAlternates: [],
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      toggleDisabled: (recipeId) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const disabled = new Set(plan.config.disabledRecipes);
          if (disabled.has(recipeId)) disabled.delete(recipeId);
          else disabled.add(recipeId);
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              disabledRecipes: Array.from(disabled),
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      useOnlyThisRecipe: (recipeId, competitorIds) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const enabled = new Set(plan.config.enabledAlternates);
          enabled.add(recipeId);
          const disabled = new Set(plan.config.disabledRecipes);
          disabled.delete(recipeId);
          for (const id of competitorIds) {
            if (id !== recipeId) disabled.add(id);
          }
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              enabledAlternates: Array.from(enabled),
              disabledRecipes: Array.from(disabled),
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      clearRecipeOverrides: () =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              enabledAlternates: [],
              disabledRecipes: [],
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      setObjective: (obj) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: { ...plan.config, objective: obj },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      setRawCap: (itemId, ratePerMin) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextCaps = { ...(plan.config.rawCaps ?? {}) };
          const nextExcluded = new Set(plan.config.excludedRawInputs ?? []);
          if (ratePerMin === null || ratePerMin <= 0 || !Number.isFinite(ratePerMin)) {
            delete nextCaps[itemId];
          } else {
            nextCaps[itemId] = ratePerMin;
            nextExcluded.delete(itemId);
          }
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              rawCaps: Object.keys(nextCaps).length ? nextCaps : undefined,
              excludedRawInputs: nextExcluded.size
                ? Array.from(nextExcluded)
                : undefined,
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      setRawExcluded: (itemId, excluded) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextExcluded = new Set(plan.config.excludedRawInputs ?? []);
          const nextCaps = { ...(plan.config.rawCaps ?? {}) };
          if (excluded) {
            nextExcluded.add(itemId);
            delete nextCaps[itemId];
          } else {
            nextExcluded.delete(itemId);
          }
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              rawCaps: Object.keys(nextCaps).length ? nextCaps : undefined,
              excludedRawInputs: nextExcluded.size
                ? Array.from(nextExcluded)
                : undefined,
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      setProvidedInput: (itemId, provided) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextProvided = new Set(plan.config.providedInputs ?? []);
          const nextCaps = { ...(plan.config.providedInputCaps ?? {}) };
          if (provided) {
            nextProvided.add(itemId);
            delete nextCaps[itemId];
          } else {
            nextProvided.delete(itemId);
          }
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              providedInputs: nextProvided.size
                ? Array.from(nextProvided)
                : undefined,
              providedInputCaps: Object.keys(nextCaps).length
                ? nextCaps
                : undefined,
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      setProvidedInputCap: (itemId, ratePerMin) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextCaps = { ...(plan.config.providedInputCaps ?? {}) };
          const nextProvided = new Set(plan.config.providedInputs ?? []);
          if (ratePerMin === null || !Number.isFinite(ratePerMin) || ratePerMin <= 0) {
            delete nextCaps[itemId];
          } else {
            nextCaps[itemId] = ratePerMin;
            nextProvided.delete(itemId);
          }
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              providedInputCaps: Object.keys(nextCaps).length
                ? nextCaps
                : undefined,
              providedInputs: nextProvided.size
                ? Array.from(nextProvided)
                : undefined,
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      setAlternateInputRatio: (recipeId, ratio) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextRatios = { ...(plan.config.alternateInputRatios ?? {}) };
          if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 1e-6) {
            delete nextRatios[recipeId];
          } else {
            nextRatios[recipeId] = ratio;
          }
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              alternateInputRatios: Object.keys(nextRatios).length
                ? nextRatios
                : undefined,
            },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      setMaxCompletedHubTier: (tier) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextConfig = { ...plan.config };
          if (tier === undefined) delete nextConfig.maxCompletedHubTier;
          else nextConfig.maxCompletedHubTier = tier;
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: nextConfig,
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      setSomersloopAmplification: (fraction) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextConfig = { ...plan.config };
          if (
            fraction === undefined ||
            !Number.isFinite(fraction) ||
            fraction <= 0
          ) {
            delete nextConfig.somersloopAmplification;
          } else {
            nextConfig.somersloopAmplification = Math.min(
              1,
              Math.max(0, fraction),
            );
          }
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: nextConfig,
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      clearRawCaps: () =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: { ...plan.config, rawCaps: undefined },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      clearTargets: () =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: { ...plan.config, targets: [] },
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      renamePlan: (name) =>
        set((state) => {
          const plan = state.plans[state.activePlanId];
          if (!plan) return {};
          const nextPlan: SavedPlan = {
            ...plan,
            name,
            updatedAt: Date.now(),
          };
          return { plans: { ...state.plans, [plan.id]: nextPlan } };
        }),

      newPlan: () => {
        const plan = makePlan(`Plan ${Object.keys(get().plans).length + 1}`);
        set((state) => ({
          plans: { ...state.plans, [plan.id]: plan },
          activePlanId: plan.id,
        }));
        return plan.id;
      },

      switchPlan: (id) => set({ activePlanId: id }),

      deletePlan: (id) =>
        set((state) => {
          const { [id]: _removedProgress, ...restProgress } =
            state.recipeBuildProgressByPlanId;
          const { [id]: _, ...rest } = state.plans;
          if (Object.keys(rest).length === 0) {
            const fresh = makePlan();
            return {
              plans: { [fresh.id]: fresh },
              activePlanId: fresh.id,
              recipeBuildProgressByPlanId: restProgress,
            };
          }
          const nextActive =
            state.activePlanId === id
              ? Object.keys(rest)[0]
              : state.activePlanId;
          return {
            plans: rest,
            activePlanId: nextActive,
            recipeBuildProgressByPlanId: restProgress,
          };
        }),

      replacePlans: (plans, activePlanId) => {
        const temporalStore = (
          store as unknown as {
            temporal: StoreApi<TemporalState<PlannerTemporalSlice>>;
          }
        ).temporal;
        const t = temporalStore.getState();
        t.pause();
        set((state) => {
          const validIds = new Set(Object.keys(plans));
          const nextProgress = Object.fromEntries(
            Object.entries(state.recipeBuildProgressByPlanId).filter(([k]) =>
              validIds.has(k),
            ),
          );
          return {
            plans,
            activePlanId,
            recipeBuildProgressByPlanId: nextProgress,
          };
        });
        t.resume();
        t.clear();
      },
    }),
      {
        limit: 50,
        partialize: (state) => ({
          plans: state.plans,
          activePlanId: state.activePlanId,
        }),
      },
    ),
    {
      name: "factory:plans",
      version: 2,
      partialize: (state) => ({
        plans: state.plans,
        activePlanId: state.activePlanId,
        recipeBuildProgressByPlanId: state.recipeBuildProgressByPlanId,
      }),
      merge: (persistedState, currentState) => {
        const p = persistedState as Partial<PlannerState> | undefined;
        if (!p || typeof p !== "object" || !p.plans) {
          return currentState;
        }
        const mergedPlans: Record<string, SavedPlan> = { ...p.plans };
        for (const key of Object.keys(mergedPlans)) {
          const plan = mergedPlans[key];
          if (!plan?.config) continue;
          mergedPlans[key] = {
            ...plan,
            config: { ...DEFAULT_PLANNER_CONFIG, ...plan.config },
          };
        }
        return {
          ...currentState,
          ...p,
          plans: mergedPlans,
          recipeBuildProgressByPlanId:
            p.recipeBuildProgressByPlanId ??
            currentState.recipeBuildProgressByPlanId,
        };
      },
    },
  ),
);

function plannerTemporalApi(): StoreApi<
  TemporalState<PlannerTemporalSlice>
> {
  return (
    usePlannerStore as unknown as {
      temporal: StoreApi<TemporalState<PlannerTemporalSlice>>;
    }
  ).temporal;
}

/** Subscribe to undo stack depth (for toolbar buttons). */
export function usePlannerTemporal<T>(
  selector: (t: TemporalState<PlannerTemporalSlice>) => T,
): T {
  return useStore(plannerTemporalApi(), selector);
}

export function undoPlannerState(): void {
  plannerTemporalApi().getState().undo();
}

export function redoPlannerState(): void {
  plannerTemporalApi().getState().redo();
}

export const useActivePlan = () => {
  const activePlanId = usePlannerStore((s) => s.activePlanId);
  const plan = usePlannerStore((s) => s.plans[s.activePlanId]);
  return { activePlanId, plan };
};

export const useActiveTargets = (): PlannerTarget[] => {
  const plan = usePlannerStore((s) => s.plans[s.activePlanId]);
  return plan?.config.targets ?? EMPTY_TARGETS;
};

/** Checklist for “Recipes in use” / in-use recipe cards (persisted per plan). */
export function useRecipeBuildProgressChecklist(): {
  checkedRecipeIds: Set<string>;
  toggleRecipeChecked: (recipeId: string) => void;
} {
  const ids = usePlannerStore((s) => {
    const planId = s.activePlanId;
    return s.recipeBuildProgressByPlanId[planId] ?? [];
  });
  const toggleRecipeBuildProgress = usePlannerStore(
    (s) => s.toggleRecipeBuildProgress,
  );
  const checkedRecipeIds = useMemo(() => new Set(ids), [ids]);
  return { checkedRecipeIds, toggleRecipeChecked: toggleRecipeBuildProgress };
}
