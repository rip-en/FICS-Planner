"use client";

import dagre from "@dagrejs/dagre";
import type { Edge as GraphEdge } from "@dagrejs/graphlib";
import { useId, useMemo } from "react";
import { getBuilding, getItem, getRecipe } from "@/lib/data";
import { buildProductionFlowEdges } from "@/lib/planner/production-flow";
import type { SolverResult } from "@/lib/planner/types";
import { dominantProductId } from "@/lib/recipe-compare";
import { cn, formatRate } from "@/lib/utils";

const NODE_MIN_W = 180;
const NODE_MAX_W = 280;
const NODE_H = 52;
const PAD = 32;

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

function estimateNodeWidth(title: string): number {
  const w = 96 + Math.min(180, Math.ceil(title.length) * 6.5);
  return Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, w));
}

/** Dagre needs one graph edge per routed spline — merge hides parallel flows. */
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

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: "TB",
    align: "UL",
    nodesep: 56,
    edgesep: 36,
    ranksep: 88,
    marginx: PAD,
    marginy: PAD,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of recipeIds) {
    const recipe = getRecipe(id);
    const title = recipe?.name ?? id;
    const w = estimateNodeWidth(title);
    g.setNode(id, { width: w, height: NODE_H });
  }

  flowEdges.forEach((fe, idx) => {
    const itemName = getItem(fe.itemId)?.name ?? fe.itemId;
    const edgeLabel = `${itemName} · ${formatRate(fe.ratePerMin)}/min`;
    const labelW = Math.min(220, 48 + itemName.length * 5.5);
    g.setEdge(
      fe.fromRecipeId,
      fe.toRecipeId,
      {
        label: edgeLabel,
        width: labelW,
        height: 22,
        labelpos: "c",
        minlen: 1,
      },
      String(idx),
    );
  });

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
      width: n.width ?? estimateNodeWidth(recipe?.name ?? id),
      height: n.height ?? NODE_H,
      title: recipe?.name ?? id,
      subtitle: building?.name,
      iconUrl: building?.iconUrl,
    });
  }

  const edges: LayoutEdge[] = [];
  const graphEdges = g.edges() as GraphEdge[];
  for (let i = 0; i < graphEdges.length; i++) {
    const edgeObj = graphEdges[i]!;
    const label = g.edge(edgeObj) as
      | { points?: { x: number; y: number }[]; label?: string }
      | undefined;
    const pts = label?.points;
    if (!pts || pts.length < 2) continue;
    const fe = flowEdges[Number(edgeObj.name)];
    const title =
      label?.label ??
      (fe
        ? `${getItem(fe.itemId)?.name ?? fe.itemId} · ${formatRate(fe.ratePerMin)}/min`
        : "");
    edges.push({
      key: `${edgeObj.v}-${edgeObj.w}-${edgeObj.name ?? i}`,
      points: pts.map((p) => ({ x: p.x, y: p.y })),
      title,
    });
  }

  const graph = g.graph();
  const width = Math.max(360, (graph.width ?? 400) + PAD * 2);
  const height = Math.max(280, (graph.height ?? 320) + PAD * 2);

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
