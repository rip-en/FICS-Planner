"use client";

import dagre from "@dagrejs/dagre";
import type { Edge as GraphEdge } from "@dagrejs/graphlib";
import {
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { getBuilding, getItem, getRecipe } from "@/lib/data";
import { buildProductionFlowEdges } from "@/lib/planner/production-flow";
import type { SolverResult } from "@/lib/planner/types";
import { dominantProductId } from "@/lib/recipe-compare";
import { cn, formatRate } from "@/lib/utils";

const NODE_MIN_W = 180;
const NODE_MAX_W = 280;
const NODE_H = 52;
const PAD = 32;

const ZOOM_MIN = 0.12;
const ZOOM_MAX = 8;
const WHEEL_FACTOR = 1.09;

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

type FlowLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
};

function estimateNodeWidth(title: string): number {
  const w = 96 + Math.min(180, Math.ceil(title.length) * 6.5);
  return Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, w));
}

/** Dagre needs one graph edge per routed spline — merge hides parallel flows. */
function buildLayout(result: SolverResult): FlowLayout | null {
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

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function FlowSvg({
  layout,
  arrowMarkerId,
  onInspectItem,
}: {
  layout: FlowLayout;
  arrowMarkerId: string;
  onInspectItem: (itemId: string) => void;
}) {
  const { nodes, edges, width, height } = layout;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block max-w-none text-gray-200"
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
  );
}

function ZoomPanShell({
  layout,
  arrowMarkerId,
  onInspectItem,
  variant,
  onExpand,
  onRequestClose,
}: {
  layout: FlowLayout;
  arrowMarkerId: string;
  onInspectItem: (itemId: string) => void;
  variant: "inline" | "fullscreen";
  onExpand?: () => void;
  onRequestClose?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const spaceHeldRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);

  zoomRef.current = zoom;
  panRef.current = pan;

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw < 8 || ch < 8) return;
    const { width: lw, height: lh } = layout;
    const s = Math.min(cw / lw, ch / lh, 1) * 0.94;
    const nextZoom = clamp(s, ZOOM_MIN, ZOOM_MAX);
    const nx = (cw - lw * nextZoom) / 2;
    const ny = (ch - lh * nextZoom) / 2;
    zoomRef.current = nextZoom;
    panRef.current = { x: nx, y: ny };
    setZoom(nextZoom);
    setPan({ x: nx, y: ny });
  }, [layout]);

  useLayoutEffect(() => {
    fitView();
  }, [layout.width, layout.height, fitView]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      spaceHeldRef.current = true;
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const applyZoomAt = useCallback(
    (clientX: number, clientY: number, nextZoom: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const z0 = zoomRef.current;
      const p0 = panRef.current;
      const cx = (mx - p0.x) / z0;
      const cy = (my - p0.y) / z0;
      const nz = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
      const nx = mx - cx * nz;
      const ny = my - cy * nz;
      zoomRef.current = nz;
      panRef.current = { x: nx, y: ny };
      setZoom(nz);
      setPan({ x: nx, y: ny });
    },
    [],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const z0 = zoomRef.current;
      const factor = e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
      applyZoomAt(e.clientX, e.clientY, z0 * factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoomAt]);

  const startPan = useCallback(
    (e: React.PointerEvent, force = false) => {
      const t = e.target as HTMLElement | null;
      if (!force && t?.closest("button")) return;
      const allow =
        force ||
        e.button === 1 ||
        (e.button === 0 && spaceHeldRef.current);
      if (!allow) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        active: true,
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
      };
    },
    [],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    const p = panRef.current;
    const next = { x: p.x + dx, y: p.y + dy };
    panRef.current = next;
    setPan(next);
  }, []);

  const endPan = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const shellClass =
    variant === "fullscreen"
      ? "flex min-h-0 flex-1 flex-col rounded-lg border border-surface-border bg-surface"
      : "flex flex-col rounded-md border border-surface-border bg-surface/40";

  const viewportClass =
    variant === "fullscreen"
      ? "min-h-0 flex-1 overflow-hidden"
      : "h-[min(52vh,520px)] min-h-[280px] overflow-hidden";

  return (
    <div className={shellClass}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-2 py-1.5 sm:px-3">
        <p className="hidden text-[10px] text-gray-500 sm:block">
          Wheel zoom · Space+drag or middle-click drag to pan
        </p>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <span className="num mr-1 hidden text-[10px] text-gray-500 sm:inline">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="btn h-8 px-2 py-0 text-xs"
            onClick={() => {
              const el = containerRef.current;
              if (!el) return;
              const z0 = zoomRef.current;
              const rect = el.getBoundingClientRect();
              applyZoomAt(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
                z0 * WHEEL_FACTOR,
              );
            }}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn h-8 px-2 py-0 text-xs"
            onClick={() => {
              const el = containerRef.current;
              if (!el) return;
              const z0 = zoomRef.current;
              const rect = el.getBoundingClientRect();
              applyZoomAt(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
                z0 / WHEEL_FACTOR,
              );
            }}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn h-8 gap-1 px-2 py-0 text-xs"
            onClick={() => fitView()}
            aria-label="Fit graph to view"
            title="Fit to view"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Fit</span>
          </button>
          {variant === "inline" && onExpand && (
            <button
              type="button"
              className="btn h-8 gap-1 px-2 py-0 text-xs"
              onClick={onExpand}
              aria-label="Expand graph"
              title="Expand"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Expand</span>
            </button>
          )}
          {variant === "fullscreen" && onRequestClose && (
            <button
              type="button"
              className="btn h-8 gap-1 px-2 py-0 text-xs"
              onClick={onRequestClose}
              aria-label="Close expanded graph"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={cn(
          viewportClass,
          "relative touch-none select-none",
          spaceHeld && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={(e) => startPan(e)}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
      >
        <div
          className="pointer-events-none absolute left-2 top-2 z-[1] flex items-center gap-1 rounded border border-surface-border bg-surface/90 px-1.5 py-0.5 text-[10px] text-gray-500 sm:hidden"
          aria-hidden
        >
          <Move className="h-3 w-3" />
          Pinch-style: two-finger scroll may pan the page — use toolbar zoom
        </div>
        <div
          className="will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: layout.width,
            height: layout.height,
          }}
        >
          <div className="pointer-events-auto inline-block">
            <FlowSvg
              layout={layout}
              arrowMarkerId={arrowMarkerId}
              onInspectItem={onInspectItem}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductionFlowDiagram({
  result,
  onInspectItem,
}: {
  result: SolverResult;
  onInspectItem: (itemId: string) => void;
}) {
  const markerUid = useId().replace(/:/g, "");
  const fullscreenMarkerUid = useId().replace(/:/g, "");
  const layout = useMemo(() => buildLayout(result), [result]);
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (!layout || layout.nodes.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        No machine-to-machine flows to graph (try a larger plan or check that
        recipes list intermediates).
      </p>
    );
  }

  return (
    <>
      <ZoomPanShell
        layout={layout}
        arrowMarkerId={`flow-arrow-${markerUid}`}
        onInspectItem={onInspectItem}
        variant="inline"
        onExpand={() => setExpanded(true)}
      />
      {mounted &&
        expanded &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-black/80 p-3 backdrop-blur-sm sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Production flow diagram expanded"
          >
            <div className="mb-2 flex shrink-0 justify-end sm:hidden">
              <button
                type="button"
                className="btn gap-2 text-xs"
                onClick={() => setExpanded(false)}
              >
                <Minimize2 className="h-4 w-4" />
                Close
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <ZoomPanShell
                layout={layout}
                arrowMarkerId={`flow-arrow-${fullscreenMarkerUid}`}
                onInspectItem={onInspectItem}
                variant="fullscreen"
                onRequestClose={() => setExpanded(false)}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
