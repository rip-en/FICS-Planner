export type ClassName = string;

export type ItemForm = "solid" | "liquid" | "gas";

export interface Item {
  id: ClassName;
  slug: string;
  name: string;
  description: string;
  icon: string;
  iconUrl: string;
  stackSize: number;
  sinkPoints: number;
  energyValue: number;
  radioactiveDecay: number;
  form: ItemForm;
  category: string;
  isRaw: boolean;
}

export interface RecipeIngredient {
  item: ClassName;
  amount: number;
  ratePerMin: number;
}

export type RecipeUnlockSource =
  | "initial"
  | "milestone"
  | "mam"
  | "hard-drive"
  | "other";

export interface RecipeUnlock {
  source: RecipeUnlockSource;
  schematicId?: ClassName;
  schematicName?: string;
  tier?: number;
}

export interface Recipe {
  id: ClassName;
  slug: string;
  name: string;
  alternate: boolean;
  inMachine: boolean;
  forBuilding: boolean;
  duration: number;
  producedIn: ClassName[];
  ingredients: RecipeIngredient[];
  products: RecipeIngredient[];
  minPower: number;
  maxPower: number;
  isVariablePower: boolean;
  unlockedBy: RecipeUnlock;
}

export interface Building {
  id: ClassName;
  slug: string;
  name: string;
  description: string;
  icon: string;
  iconUrl: string;
  powerConsumption: number;
  manufacturingSpeed: number;
  categories: string[];
  kind: "manufacturer" | "extractor" | "generator" | "other";
}

export interface Resource {
  item: ClassName;
}

export interface Generator {
  id: ClassName;
  fuel: ClassName[];
  powerProduction: number;
}

export interface GameDataset {
  items: Record<ClassName, Item>;
  recipes: Record<ClassName, Recipe>;
  buildings: Record<ClassName, Building>;
  resources: Record<ClassName, Resource>;
  generators: Record<ClassName, Generator>;
}
