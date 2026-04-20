"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlannerConfig, PlannerTarget } from "@/lib/planner/types";
import { DEFAULT_PLANNER_CONFIG } from "@/lib/planner/types";

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
  removeTarget: (itemId: string) => void;
  setTargetRate: (itemId: string, rate: number) => void;
  toggleAlternate: (recipeId: string) => void;
  toggleDisabled: (recipeId: string) => void;
  /** Lock an item to a single recipe: enable it if alternate, disable every
   * competing producer for each of its products. */
  useOnlyThisRecipe: (recipeId: string, competitorIds: string[]) => void;
  setObjective: (obj: PlannerConfig["objective"]) => void;
  /** Max supply items/min for this raw; null removes the cap. */
  setRawCap: (itemId: string, ratePerMin: number | null) => void;
  clearRawCaps: () => void;
  clearTargets: () => void;
  clearRecipeOverrides: () => void;
  renamePlan: (name: string) => void;
  newPlan: () => string;
  switchPlan: (id: string) => void;
  deletePlan: (id: string) => void;
  replacePlans: (plans: Record<string, SavedPlan>, activePlanId: string) => void;
}

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
    (set, get) => ({
      activePlanId: initialPlan.id,
      plans: { [initialPlan.id]: initialPlan },

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
          if (ratePerMin === null || ratePerMin <= 0 || !Number.isFinite(ratePerMin)) {
            delete nextCaps[itemId];
          } else {
            nextCaps[itemId] = ratePerMin;
          }
          const nextPlan: SavedPlan = {
            ...plan,
            updatedAt: Date.now(),
            config: {
              ...plan.config,
              rawCaps: Object.keys(nextCaps).length ? nextCaps : undefined,
            },
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
          const { [id]: _, ...rest } = state.plans;
          if (Object.keys(rest).length === 0) {
            const fresh = makePlan();
            return { plans: { [fresh.id]: fresh }, activePlanId: fresh.id };
          }
          const nextActive =
            state.activePlanId === id
              ? Object.keys(rest)[0]
              : state.activePlanId;
          return { plans: rest, activePlanId: nextActive };
        }),

      replacePlans: (plans, activePlanId) =>
        set(() => ({ plans, activePlanId })),
    }),
    {
      name: "factory:plans",
      version: 1,
    },
  ),
);

export const useActivePlan = () => {
  const activePlanId = usePlannerStore((s) => s.activePlanId);
  const plan = usePlannerStore((s) => s.plans[s.activePlanId]);
  return { activePlanId, plan };
};

export const useActiveTargets = (): PlannerTarget[] => {
  const plan = usePlannerStore((s) => s.plans[s.activePlanId]);
  return plan?.config.targets ?? [];
};
