# FICS-Planner

> A unified catalog, recipe browser, and factory planner for **Satisfactory 1.1**. Everything on one screen — no more tab graveyards.

[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)](https://nextjs.org/) [![TypeScript 5](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/) [![Tailwind 3](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss)](https://tailwindcss.com/) [![License MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## Why

The community planners are great, but "open one item, scroll, open the next in a new tab, repeat until 20 tabs deep" wears you out. Factory puts the entire catalog, the item-detail view, and the production planner into a single three-pane workspace. Click an item to inspect it, double-click to make it a production target, watch the LP solver rebalance your factory live.

## Features

- **Single-page dashboard** — catalog on the left, planner in the middle, inspectable item details on the right.
- **All 175 items at once** with fuzzy search (Fuse.js) and a category filter.
- **Deep-linked item pages** at `/items/[slug]` — SSG, fast, shareable.
- **LP-based production solver** powered by [`javascript-lp-solver`](https://github.com/JWally/jsLPSolver):
  - Multiple production targets with live editing
  - "Minimize buildings" or "minimize raw inputs" objective
  - Per-recipe enable/disable and a one-click "use only this recipe" lock
  - Byproduct / surplus tracking
  - Clear **Missing inputs** warnings when a recipe chain is blocked by your settings
- **Alternate recipe management** with MAM / Hard Drive / Milestone source badges and a source filter so you know exactly how each one is unlocked.
- **Named plans**, persisted to `localStorage`, with JSON import/export for sharing.
- **Keyboard shortcut** — press <kbd>/</kbd> anywhere to focus the catalog search.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** for styling
- **Zustand** (+ `persist`) for planner state
- **Fuse.js** for search
- **javascript-lp-solver** for the production solver
- **lucide-react** for icons

No backend. Fully static-exportable.

## Quick start

```bash
git clone https://github.com/<you>/factory.git
cd factory
npm install
npm run dev            # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

## Regenerating game data

The app ships with pre-baked normalized JSON under `/data`. If you want to rebuild from the official game export:

```bash
npm run etl:fetch      # downloads the latest community dump and re-runs the ETL
# or in two steps:
curl -L https://raw.githubusercontent.com/greeny/SatisfactoryTools/master/data/data1.0.json -o data/raw/data.json
npm run etl
```

The ETL (`scripts/etl.ts`) transforms the raw dump into:

- `data/items.json` — items with stack size, sink points, category, icon URL
- `data/recipes.json` — machine recipes with per-minute rates precomputed and `unlockedBy` (MAM / Hard Drive / Milestone) metadata
- `data/buildings.json` — producer/extractor/generator buildings with power consumption
- `data/resources.json`, `data/generators.json` — world-extraction + power source tables

## Project layout

```
factory/
├── app/                          Next.js App Router
│   ├── page.tsx                  Unified dashboard
│   ├── items/[id]/page.tsx       SSG item detail pages
│   ├── recipes/page.tsx          All recipes browser
│   └── buildings/page.tsx        All buildings browser
├── components/
│   ├── catalog/                  Catalog panel + cards
│   ├── item-detail/              Detail drawer + recipe cards
│   └── planner/                  Toolbar, targets, alt-recipe toggles, results
├── lib/
│   ├── brand.ts                  App name, tagline
│   ├── data/                     Typed accessors over the JSON dataset
│   ├── planner/                  LP solver + types
│   └── store/                    Zustand planner store
├── data/                         Normalized game data (committed)
├── scripts/etl.ts                Raw Docs.json → normalized JSON
└── types/game.ts                 Canonical game types
```

## Scripts

| Command               | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `npm run dev`         | Development server (hot reload)                        |
| `npm run build`       | Production build                                       |
| `npm start`           | Serve the production build                             |
| `npm run lint`        | ESLint via `eslint-config-next`                        |
| `npm run typecheck`   | Strict TypeScript typecheck (`tsc --noEmit`)           |
| `npm run etl`         | Rebuild `data/*.json` from `data/raw/data.json`        |
| `npm run etl:fetch`   | Download the latest dump and run the ETL               |

## Contributing

PRs welcome. Keep it small and focused. Before opening one:

```bash
npm run typecheck
npm run lint
npm run build
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all three on every push and PR.

## Attribution

Satisfactory, FICSIT, and all related trademarks, assets, and game content are the property of **Coffee Stain Studios**. This project is a fan-made tool and is **not affiliated with, endorsed by, or sponsored by Coffee Stain Studios**. See [NOTICE.md](NOTICE.md) for full third-party attribution.

## License

[MIT](LICENSE).
