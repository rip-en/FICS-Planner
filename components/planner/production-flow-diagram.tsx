"use client";

import dagre from "@dagrejs/dagre";
import { useId, useMemo } from "react";
import { getBuilding, getItem, getRecipe } from "@/lib/data";
import { buildProductionFlowEdges } from "@/lib/planner/production-flow";
import type { SolverResult } from "@/lib/planner/types";
import { dominantProductId } from "@/lib/recipe-compare";
import { cn, formatRate } from "@/lib/utils";

const NODE_W = 196;
const NODE_H = 48;
const PAD = 28;

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle?: string;
  iconUrl?: string;
}

interface LayoutEdge {
  key: string;
  points: { x: number; y: number }[];
  title: string;
}

function buildLayout(result: SolverResult): {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
} | null {
  if (!result.feasible || result.recipes.length === 0) return null;

  const flowEdges = buildProductionFlowEdges(result);
  if (flowEdges.length === 0) return null;

  const recipeIds = new Set<string>();
  for (const u of result.recipes) recipeIds.add(u.recipeId);
  for (const e of flowEdges) {
    recipeIds.add(e.fromRecipeId);
    recipeIds.add(e.toRecipeId);
  }

  const merged = new Map<
    string,
    { items: Array<{ itemId: string; ratePerMin: number }> }
  >();
  const sep = "\x00";
  for (const e of flowEdges) {
    const k = `${e.fromRecipeId}${sep}${e.toRecipeId}`;
    let block = merged.get(k);
    if (!block) {
      block = { items: [] };
      merged.set(k, block);
    }
    block.items.push({ itemId: e.itemId, ratePerMin: e.ratePerMin });
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 32,
    ranksep: 56,
    marginx: PAD,
    marginy: PAD,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of recipeIds) {
    g.setNode(id, { width: NODE_W, height: NODE_H });
  }

  for (const [k, block] of merged) {
    const [from, to] = k.split(sep);
    const title = block.items
      .map((it) => {
        const name = getItem(it.itemId)?.name ?? it.itemId;
        return `${name} ${formatRate(it.ratePerMin)}`;
      })
      .join(" · ");
    g.setEdge(from, to, { label: title });
  }

  dagre.layout(g);

  const nodes: LayoutNode[] = [];
  for (const id of recipeIds) {
    const n = g.node(id);
    if (!n || n.x === undefined || n.y === undefined) continue;
    const recipe = getRecipe(id);
    const usage = result.recipes.find((u) => u.recipeId === id);
    const buildingId = usage?.buildingId ?? recipe?.producedIn[0];
    const building = buildingId ? getBuilding(buildingId) : undefined;
    nodes.push({
      id,
      x: n.x,
      y: n.y,
      width: n.width ?? NODE_W,
      height: n.height ?? NODE_H,
      title: recipe?.name ?? id,
      subtitle: building?.name,
      iconUrl: building?.iconUrl,
    });
  }

  const edges: LayoutEdge[] = [];
  for (const [k, block] of merged) {
    const [from, to] = k.split(sep);
    const e = g.edge(from, to);
    const pts = e?.points;
    if (!pts || pts.length < 2) continue;
    edges.push({
      key: k,
      points: pts.map((p: { x: number; y: number }) => ({
        x: p.x,
        y: p.y,
      })),
      title: block.items
        .map((it) => {
          const name = getItem(it.itemId)?.name ?? it.itemId;
          return `${name} ${formatRate(it.ratePerMin)}/min`;
        })
        .join("\n"),
    });
  }

  const graph = g.graph();
  const width = Math.max(320, (graph.width ?? 400) + PAD * 2);
  const height = Math.max(240, (graph.height ?? 300) + PAD * 2);

  return { nodes, edges, width, height };
}

function pointsToPathD(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i]!.x} ${points[i]!.y}`;
  }
  return d;
}

export function ProductionFlowDiagram({
  result,
  onInspectItem,
}: {
  result: SolverResult;
  onInspectItem: (itemId: string) => void;
}) {
  const markerUid = useId().replace(/:/g, "");
  const arrowMarkerId = `flow-arrow-${markerUid}`;
  const layout = useMemo(() => buildLayout(result), [result]);

  if (!layout || layout.nodes.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        No machine-to-machine flows to graph (try a larger plan or check that
        recipes list intermediates).
      </p>
    );
  }

  const { nodes, edges, width, height } = layout;

  return (
    <div className="overflow-x-auto rounded-md border border-surface-border bg-surface/40">
      <svg
        className="min-h-[280px] w-full min-w-[640px] text-gray-200"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Production flow between recipes in this plan"
      >
        <defs>
          <marker
            id={arrowMarkerId}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 z" fill="rgb(107 114 128)" />
          </marker>
        </defs>

        {edges.map((e) => (
          <g key={e.key}>
            <title>{e.title}</title>
            <path
              d={pointsToPathD(e.points)}
              fill="none"
              stroke="rgb(107 114 128)"
              strokeWidth={1.25}
              markerEnd={`url(#${arrowMarkerId})`}
              opacity={0.92}
            />
          </g>
        ))}

        {nodes.map((n) => {
          const recipe = getRecipe(n.id);
          const primary = recipe ? dominantProductId(recipe) : undefined;
          const inspectId = primary ?? recipe?.products[0]?.item;

          const left = n.x - n.width / 2;
          const top = n.y - n.height / 2;

          return (
            <g key={n.id}>
              <rect
                x={left}
                y={top}
                width={n.width}
                height={n.height}
                rx={8}
                fill="rgb(30 32 38)"
                stroke="rgb(55 58 66)"
                strokeWidth={1}
              />
              <foreignObject
                x={left + 8}
                y={top + 6}
                width={n.width - 16}
                height={n.height - 12}
              >
                <button
                  type="button"
                  disabled={!inspectId}
                  onClick={() => inspectId && onInspectItem(inspectId)}
                  className={cn(
                    "flex h-full w-full min-w-0 items-start gap-2 rounded-md border-0 bg-transparent p-0 text-left text-[11px] leading-snug text-gray-100 transition",
                    inspectId
                      ? "cursor-pointer hover:text-brand"
                      : "cursor-default opacity-80",
                  )}
                >
                  {n.iconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- SVG foreignObject
                    <img
                      src={n.iconUrl}
                      alt=""
                      width={22}
                      height={22}
                      className="shrink-0 rounded-sm"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-medium">{n.title}</span>
                    {n.subtitle && (
                      <span className="mt-0.5 block truncate text-[10px] text-gray-500">
                        {n.subtitle}
                      </span>
                    )}
                  </span>
                </button>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
