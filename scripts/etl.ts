/**
 * ETL: transform the raw greeny/SatisfactoryTools `data.json` game dump into
 * the normalized, typed JSON the app consumes. Run via `npm run etl`.
 *
 * Output files (committed to /data):
 *   - items.json
 *   - recipes.json
 *   - buildings.json
 *   - resources.json
 *   - generators.json
 *
 * Per-minute rates for each recipe input/output are precomputed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Building,
  Generator,
  Item,
  Recipe,
  RecipeUnlock,
  RecipeUnlockSource,
  Resource,
} from "../types/game";

const ROOT = resolve(__dirname, "..");
const RAW_PATH = resolve(ROOT, "data/raw/data.json");
const OUT_DIR = resolve(ROOT, "data");

const RAW_RESOURCES = new Set<string>([
  "Desc_OreIron_C",
  "Desc_OreCopper_C",
  "Desc_OreBauxite_C",
  "Desc_OreGold_C",
  "Desc_OreUranium_C",
  "Desc_Coal_C",
  "Desc_Sulfur_C",
  "Desc_RawQuartz_C",
  "Desc_Stone_C",
  "Desc_SAM_C",
  "Desc_Water_C",
  "Desc_LiquidOil_C",
  "Desc_NitrogenGas_C",
]);

const iconUrl = (icon: string): string =>
  `https://www.satisfactorytools.com/assets/images/items/${icon}_64.png`;

const deriveForm = (raw: RawItem): "solid" | "liquid" | "gas" => {
  if (raw.className === "Desc_NitrogenGas_C") return "gas";
  if (raw.liquid) return "liquid";
  return "solid";
};

const categorize = (raw: RawItem): string => {
  const n = raw.name.toLowerCase();
  const d = (raw.description ?? "").toLowerCase();
  if (RAW_RESOURCES.has(raw.className)) return "Raw Resource";
  if (raw.liquid) return "Fluid";
  if (raw.className === "Desc_NitrogenGas_C") return "Fluid";
  if (/ingot/.test(n)) return "Ingot";
  if (/fuel rod|uranium|plutonium|ficsonium|nuclear|waste/.test(n))
    return "Nuclear";
  if (/space elevator|adaptive control|automated wiring|assembly director|magnetic field|versatile|modular engine|thermal propulsion|nuclear pasta|ballistic warp drive|ai expansion/.test(n))
    return "Space Elevator";
  if (/ammo|rebar|nobelisk|rifle|cartridge|shatter|homing|explosive|turbo rifle|pulse/.test(n))
    return "Ammunition";
  if (/biomass|leaves|wood|mycelia|alien/.test(n)) return "Biomass";
  if (/packaged/.test(n)) return "Packaged";
  if (/beacon|portable miner|xeno|object scanner|blade runner|parachute|jetpack|hover|gas mask|hazmat|factory cart|zipline|chainsaw|rebar gun|rifle/.test(n))
    return "Equipment";
  if (/wire|cable|connector|board|circuit|quickwire|limiter/.test(n))
    return "Electronics";
  if (/pipe|plate|rod|frame|beam|screw|rotor|stator|motor|crystal oscillator|control rod|radio|turbo motor|conversion cube|singularity|neural|diamond|time|ficsite|fuel rod|heat sink|cooling system|pressure|super|battery/.test(n))
    return "Industrial Parts";
  if (/concrete|silica|quartz|polymer|rubber|plastic|resin|solution|waste|powder|gunpowder|caterium|aluminum/.test(n))
    return "Refined";
  if (/mercer|dna capsule|slug|power slug|hard drive|blueprint|somersloop|sam|singularity cell/.test(n))
    return "Special";
  if (/color cartridge|fics\*mas|snow|candy|gift|snowball|actual snow|tree branch/.test(n))
    return "Holiday";
  if (/ficsit|nutrient|protein|medicinal|beryl|paleberry|bacon agaric/.test(d))
    return "Consumable";
  return "Other";
};

interface RawItem {
  slug: string;
  icon: string;
  name: string;
  description: string;
  sinkPoints?: number;
  className: string;
  stackSize: number;
  energyValue?: number;
  radioactiveDecay?: number;
  liquid?: boolean;
}

interface RawRecipeIngredient {
  item: string;
  amount: number;
}

interface RawRecipe {
  slug: string;
  name: string;
  className: string;
  alternate: boolean;
  time: number;
  inHand: boolean;
  forBuilding: boolean;
  inWorkshop: boolean;
  inMachine: boolean;
  manualTimeMultiplier: number;
  ingredients: RawRecipeIngredient[];
  products: RawRecipeIngredient[];
  producedIn: string[];
  isVariablePower: boolean;
  minPower: number;
  maxPower: number;
}

interface RawBuilding {
  slug: string;
  icon: string;
  name: string;
  description: string;
  className: string;
  categories: string[];
  buildMenuPriority: number;
  metadata?: {
    powerConsumption?: number;
    powerConsumptionExponent?: number;
    manufacturingSpeed?: number;
  };
}

interface RawGenerator {
  className: string;
  fuel: string[];
  powerProduction: number;
}

interface RawSchematic {
  className: string;
  type: string; // e.g. EST_MAM, EST_Alternate, EST_Milestone, EST_ResourceSink
  name: string;
  slug: string;
  tier?: number;
  unlock?: {
    recipes?: string[];
  };
  mam?: boolean;
  alternate?: boolean;
}

interface RawDataset {
  items: Record<string, RawItem>;
  recipes: Record<string, RawRecipe>;
  buildings: Record<string, RawBuilding>;
  resources: Record<string, { item: string }>;
  miners: Record<string, { className: string }>;
  generators: Record<string, RawGenerator>;
  schematics: Record<string, RawSchematic>;
}

const MANUFACTURERS = new Set<string>([
  "Desc_SmelterMk1_C",
  "Desc_FoundryMk1_C",
  "Desc_ConstructorMk1_C",
  "Desc_AssemblerMk1_C",
  "Desc_ManufacturerMk1_C",
  "Desc_Packager_C",
  "Desc_OilRefinery_C",
  "Desc_Blender_C",
  "Desc_HadronCollider_C",
  "Desc_QuantumEncoder_C",
  "Desc_Converter_C",
]);

const EXTRACTORS = new Set<string>([
  "Desc_MinerMk1_C",
  "Desc_MinerMk2_C",
  "Desc_MinerMk3_C",
  "Desc_OilPump_C",
  "Desc_FrackingExtractor_C",
  "Desc_FrackingSmasher_C",
  "Desc_WaterPump_C",
]);

function main() {
  if (!existsSync(RAW_PATH)) {
    console.error(
      `Missing ${RAW_PATH}. Run: curl -L https://raw.githubusercontent.com/greeny/SatisfactoryTools/master/data/data1.0.json -o data/raw/data.json`
    );
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as RawDataset;

  // Build recipe -> unlock-source map from schematics.
  const schematicTypeToSource = (t: string): RecipeUnlockSource => {
    if (t === "EST_MAM") return "mam";
    if (t === "EST_Alternate") return "hard-drive";
    if (t === "EST_Milestone") return "milestone";
    return "other";
  };
  const recipeUnlock: Record<string, RecipeUnlock> = {};
  for (const schematic of Object.values(raw.schematics ?? {})) {
    const source = schematicTypeToSource(schematic.type);
    if (source === "other") continue;
    const recipes = schematic.unlock?.recipes ?? [];
    for (const recipeId of recipes) {
      // prefer MAM/Hard-Drive sources over Milestone when multiple unlocks
      // reference the same recipe (alternates are always unlocked by a single
      // MAM or HDD node, but some recipes are milestone-adjacent).
      const existing = recipeUnlock[recipeId];
      if (
        !existing ||
        (existing.source === "milestone" && source !== "milestone")
      ) {
        recipeUnlock[recipeId] = {
          source,
          schematicId: schematic.className,
          schematicName: schematic.name,
          tier: schematic.tier,
        };
      }
    }
  }

  const items: Record<string, Item> = {};
  for (const [id, it] of Object.entries(raw.items)) {
    items[id] = {
      id,
      slug: it.slug,
      name: it.name,
      description: it.description ?? "",
      icon: it.icon,
      iconUrl: iconUrl(it.icon),
      stackSize: it.stackSize,
      sinkPoints: it.sinkPoints ?? 0,
      energyValue: it.energyValue ?? 0,
      radioactiveDecay: it.radioactiveDecay ?? 0,
      form: deriveForm(it),
      category: categorize(it),
      isRaw: RAW_RESOURCES.has(id),
    };
  }

  const recipes: Record<string, Recipe> = {};
  let droppedForBuilding = 0;
  for (const [id, r] of Object.entries(raw.recipes)) {
    // drop building construction recipes - not useful for the factory planner
    if (r.forBuilding) {
      droppedForBuilding++;
      continue;
    }
    // drop recipes that are only hand-craftable (no machine)
    if (!r.inMachine && r.producedIn.length === 0) continue;

    const perMin = (amount: number) => (amount * 60) / r.time;
    recipes[id] = {
      id,
      slug: r.slug,
      name: r.name,
      alternate: r.alternate,
      inMachine: r.inMachine,
      forBuilding: r.forBuilding,
      duration: r.time,
      producedIn: r.producedIn,
      ingredients: r.ingredients.map((ing) => ({
        item: ing.item,
        amount: ing.amount,
        ratePerMin: perMin(ing.amount),
      })),
      products: r.products.map((p) => ({
        item: p.item,
        amount: p.amount,
        ratePerMin: perMin(p.amount),
      })),
      minPower: r.minPower,
      maxPower: r.maxPower,
      isVariablePower: r.isVariablePower,
      unlockedBy: recipeUnlock[id] ?? { source: "initial" },
    };
  }

  const buildings: Record<string, Building> = {};
  for (const [id, b] of Object.entries(raw.buildings)) {
    const power = b.metadata?.powerConsumption ?? 0;
    const speed = b.metadata?.manufacturingSpeed ?? 0;
    const kind: Building["kind"] = MANUFACTURERS.has(id)
      ? "manufacturer"
      : EXTRACTORS.has(id)
        ? "extractor"
        : "other";
    buildings[id] = {
      id,
      slug: b.slug,
      name: b.name,
      description: b.description ?? "",
      icon: b.icon,
      iconUrl: iconUrl(b.icon),
      powerConsumption: power,
      manufacturingSpeed: speed,
      categories: b.categories ?? [],
      kind,
    };
  }

  // bring generators in as buildings too
  const generators: Record<string, Generator> = {};
  for (const [id, g] of Object.entries(raw.generators)) {
    generators[id] = {
      id,
      fuel: g.fuel,
      powerProduction: g.powerProduction,
    };
    if (!buildings[id]) {
      buildings[id] = {
        id,
        slug: id.toLowerCase(),
        name: id.replace(/^Desc_|_C$/g, "").replace(/Generator/g, "Generator "),
        description: "Power generator",
        icon: id.toLowerCase().replace(/_/g, "-"),
        iconUrl: iconUrl(id.toLowerCase().replace(/_/g, "-")),
        powerConsumption: -g.powerProduction,
        manufacturingSpeed: 1,
        categories: [],
        kind: "generator",
      };
    } else {
      buildings[id].kind = "generator";
      buildings[id].powerConsumption = -g.powerProduction;
    }
  }

  const resources: Record<string, Resource> = {};
  for (const [id, r] of Object.entries(raw.resources)) {
    resources[id] = { item: r.item };
  }

  // make sure raw resources are flagged
  for (const id of Object.keys(resources)) {
    if (items[id]) items[id].isRaw = true;
  }

  writeFileSync(resolve(OUT_DIR, "items.json"), JSON.stringify(items, null, 2));
  writeFileSync(
    resolve(OUT_DIR, "recipes.json"),
    JSON.stringify(recipes, null, 2),
  );
  writeFileSync(
    resolve(OUT_DIR, "buildings.json"),
    JSON.stringify(buildings, null, 2),
  );
  writeFileSync(
    resolve(OUT_DIR, "resources.json"),
    JSON.stringify(resources, null, 2),
  );
  writeFileSync(
    resolve(OUT_DIR, "generators.json"),
    JSON.stringify(generators, null, 2),
  );

  const counts = {
    items: Object.keys(items).length,
    recipes: Object.keys(recipes).length,
    droppedForBuilding,
    buildings: Object.keys(buildings).length,
    resources: Object.keys(resources).length,
    generators: Object.keys(generators).length,
  };
  console.log("ETL complete:", counts);
}

main();
