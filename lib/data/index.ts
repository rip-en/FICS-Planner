import itemsJson from "@/data/items.json";
import recipesJson from "@/data/recipes.json";
import buildingsJson from "@/data/buildings.json";
import resourcesJson from "@/data/resources.json";
import generatorsJson from "@/data/generators.json";
import type {
  Building,
  ClassName,
  Generator,
  Item,
  Recipe,
  Resource,
} from "@/types/game";

export const items = itemsJson as unknown as Record<ClassName, Item>;
export const recipes = recipesJson as unknown as Record<ClassName, Recipe>;
export const buildings = buildingsJson as unknown as Record<
  ClassName,
  Building
>;
export const resources = resourcesJson as unknown as Record<
  ClassName,
  Resource
>;
export const generators = generatorsJson as unknown as Record<
  ClassName,
  Generator
>;

export const allItems = (): Item[] => Object.values(items);
export const allRecipes = (): Recipe[] => Object.values(recipes);
export const allBuildings = (): Building[] => Object.values(buildings);

export const getItem = (id: ClassName): Item | undefined => items[id];
export const getRecipe = (id: ClassName): Recipe | undefined => recipes[id];
export const getBuilding = (id: ClassName): Building | undefined =>
  buildings[id];

const recipesProducingByItem = new Map<ClassName, Recipe[]>();
const recipesConsumingByItem = new Map<ClassName, Recipe[]>();
const NO_RECIPES: Recipe[] = [];

for (const r of Object.values(recipes)) {
  for (const p of r.products) {
    let list = recipesProducingByItem.get(p.item);
    if (!list) {
      list = [];
      recipesProducingByItem.set(p.item, list);
    }
    list.push(r);
  }
  for (const ing of r.ingredients) {
    let list = recipesConsumingByItem.get(ing.item);
    if (!list) {
      list = [];
      recipesConsumingByItem.set(ing.item, list);
    }
    list.push(r);
  }
}

/** Recipes whose products include this item (shared array; do not mutate). */
export const recipesProducing = (itemId: ClassName): Recipe[] =>
  recipesProducingByItem.get(itemId) ?? NO_RECIPES;

/** Recipes whose ingredients include this item (shared array; do not mutate). */
export const recipesConsuming = (itemId: ClassName): Recipe[] =>
  recipesConsumingByItem.get(itemId) ?? NO_RECIPES;

/**
 * Recipe ids in `planIds` that output `itemId`. For flow-graph and solver helpers.
 */
export function recipeIdsProducingItemInPlan(
  itemId: ClassName,
  planIds: ReadonlySet<string>,
): string[] {
  const list = recipesProducingByItem.get(itemId);
  if (!list) return [];
  const out: string[] = [];
  for (const r of list) {
    if (planIds.has(r.id)) out.push(r.id);
  }
  return out;
}

/** A sorted unique list of every item category present in the dataset. */
export const itemCategories = (): string[] => {
  const set = new Set<string>();
  for (const it of allItems()) set.add(it.category);
  return Array.from(set).sort();
};

/** Default (non-alternate) recipe for a produced item, if it exists. */
export const defaultRecipeFor = (itemId: ClassName): Recipe | undefined => {
  const options = recipesProducing(itemId);
  if (options.length === 0) return undefined;
  const sorted = [...options].sort((a, b) => {
    const aM = a.inMachine ? 0 : 1;
    const bM = b.inMachine ? 0 : 1;
    if (aM !== bM) return aM - bM;
    const aAlt = a.alternate ? 1 : 0;
    const bAlt = b.alternate ? 1 : 0;
    if (aAlt !== bAlt) return aAlt - bAlt;
    const ra = a.products.find((p) => p.item === itemId)?.ratePerMin ?? 0;
    const rb = b.products.find((p) => p.item === itemId)?.ratePerMin ?? 0;
    if (rb !== ra) return rb - ra;
    return a.id.localeCompare(b.id);
  });
  return sorted[0];
};

/** Item map keyed by slug for /items/[id] lookups. */
export const itemBySlug = (slug: string): Item | undefined =>
  allItems().find((it) => it.slug === slug);
