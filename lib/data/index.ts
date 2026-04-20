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

/** Recipes whose products include this item. */
export const recipesProducing = (itemId: ClassName): Recipe[] =>
  allRecipes().filter((r) => r.products.some((p) => p.item === itemId));

/** Recipes whose ingredients include this item. */
export const recipesConsuming = (itemId: ClassName): Recipe[] =>
  allRecipes().filter((r) => r.ingredients.some((p) => p.item === itemId));

/** A sorted unique list of every item category present in the dataset. */
export const itemCategories = (): string[] => {
  const set = new Set<string>();
  for (const it of allItems()) set.add(it.category);
  return Array.from(set).sort();
};

/** Default (non-alternate) recipe for a produced item, if it exists. */
export const defaultRecipeFor = (itemId: ClassName): Recipe | undefined => {
  const options = recipesProducing(itemId);
  return (
    options.find((r) => !r.alternate && r.inMachine) ??
    options.find((r) => r.inMachine) ??
    options[0]
  );
};

/** Item map keyed by slug for /items/[id] lookups. */
export const itemBySlug = (slug: string): Item | undefined =>
  allItems().find((it) => it.slug === slug);
