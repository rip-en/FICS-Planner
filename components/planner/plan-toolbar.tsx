"use client";

import {
  Check,
  Eye,
  Download,
  Plus as PlusIcon,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "@/lib/brand";
import {
  PLAN_IMPORT_MAX_FILE_BYTES,
  validatePlanImportJson,
} from "@/lib/plan-import";
import { HUB_TIER_MAX } from "@/lib/planner/solver";
import { usePlannerStore, type SavedPlan } from "@/lib/store/planner-store";
import type { PlannerConfig } from "@/lib/planner/types";

interface ExportShape {
  version: 1;
  plans: Record<string, SavedPlan>;
  activePlanId: string;
}

export interface PlannerSectionSetting {
  id: string;
  label: string;
}

interface PlanToolbarProps {
  sectionSettings?: PlannerSectionSetting[];
  hiddenSectionIds?: string[];
  onToggleSectionVisibility?: (sectionId: string) => void;
}

export function PlanToolbar({
  sectionSettings = [],
  hiddenSectionIds = [],
  onToggleSectionVisibility,
}: PlanToolbarProps) {
  const plans = usePlannerStore((s) => s.plans);
  const activePlanId = usePlannerStore((s) => s.activePlanId);
  const rename = usePlannerStore((s) => s.renamePlan);
  const newPlan = usePlannerStore((s) => s.newPlan);
  const switchPlan = usePlannerStore((s) => s.switchPlan);
  const deletePlan = usePlannerStore((s) => s.deletePlan);
  const setObjective = usePlannerStore((s) => s.setObjective);
  const setMaxCompletedHubTier = usePlannerStore((s) => s.setMaxCompletedHubTier);
  const replacePlans = usePlannerStore((s) => s.replacePlans);
  const clearRecipeOverrides = usePlannerStore((s) => s.clearRecipeOverrides);
  const plan = plans[activePlanId];
  const overrideCount =
    (plan?.config.enabledAlternates.length ?? 0) +
    (plan?.config.disabledRecipes.length ?? 0);
  const hiddenSectionIdSet = useMemo(
    () => new Set(hiddenSectionIds),
    [hiddenSectionIds],
  );
  const hiddenCount = hiddenSectionIds.length;
  const [isSectionsMenuOpen, setIsSectionsMenuOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSectionsMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const el = sectionsMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setIsSectionsMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSectionsMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isSectionsMenuOpen]);

  if (!plan) return null;

  const objective: PlannerConfig["objective"] =
    plan.config.objective ?? "buildings";

  const handleExport = () => {
    const payload: ExportShape = { version: 1, plans, activePlanId };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    a.download = `${slug}-plans-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    setImportError(null);
    if (file.size > PLAN_IMPORT_MAX_FILE_BYTES) {
      setImportError(
        `That file is too large (max ${Math.round(PLAN_IMPORT_MAX_FILE_BYTES / 1024)} KB).`,
      );
      return;
    }
    try {
      const text = await file.text();
      const result = validatePlanImportJson(text);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      replacePlans(result.data.plans, result.data.activePlanId);
    } catch {
      setImportError("Could not read that file.");
    }
  };

  const plansSorted = Object.values(plans).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  return (
    <div className="card flex flex-col gap-2 p-2 lg:flex-row lg:flex-wrap lg:items-center">
      {importError && (
        <div
          className="flex w-full basis-full items-start justify-between gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-200"
          role="alert"
        >
          <span>{importError}</span>
          <button
            type="button"
            className="shrink-0 rounded px-1 text-red-100/90 hover:bg-red-500/20"
            onClick={() => setImportError(null)}
            aria-label="Dismiss import error"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <select
          value={activePlanId}
          onChange={(e) => switchPlan(e.target.value)}
          className="input min-w-0 max-w-[min(100%,11rem)] shrink-0 sm:max-w-[140px]"
          aria-label="Switch plan"
        >
          {plansSorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          value={plan.name}
          onChange={(e) => rename(e.target.value)}
          className="input min-w-0 flex-1"
          aria-label="Plan name"
          placeholder="Plan name"
        />
        <div className="hidden items-center gap-1 whitespace-nowrap text-[11px] text-gray-500 md:flex">
          <Check className="h-3 w-3 text-green-400" />
          Saved
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex max-w-[11rem] flex-col gap-0.5 text-xs text-gray-400 sm:max-w-none">
          <span className="hidden sm:inline">Hub tier done</span>
          <span className="text-[10px] leading-tight text-gray-500 sm:hidden">
            Hub tier
          </span>
          <select
            value={plan.config.maxCompletedHubTier ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setMaxCompletedHubTier(
                v === "" ? undefined : Math.min(
                  HUB_TIER_MAX,
                  Math.max(0, Math.floor(Number(v))),
                ),
              );
            }}
            className="input w-full min-w-0 sm:w-auto"
            title="Milestone recipes from higher hub tiers are disabled; items you cannot build yet are dimmed in the catalog"
            aria-label="Highest completed hub tier for milestone gating"
          >
            <option value="">No limit</option>
            {Array.from({ length: HUB_TIER_MAX + 1 }, (_, i) => (
              <option key={i} value={i}>
                Through tier {i}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-400">
          <span className="hidden sm:inline">Optimize</span>
          <select
            value={objective}
            onChange={(e) =>
              setObjective(e.target.value as PlannerConfig["objective"])
            }
            className="input w-auto"
            aria-label="Optimization objective"
          >
            <option value="buildings">Min buildings</option>
            <option value="raw">Min raw inputs</option>
          </select>
        </label>
        {overrideCount > 0 && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Clear all enabled alternates and disabled recipes for this plan?",
                )
              )
                clearRecipeOverrides();
            }}
            className="btn"
            title="Clear all enabled alternates and disabled recipes"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset ({overrideCount})
          </button>
        )}
        {sectionSettings.length > 0 && (
          <div className="relative" ref={sectionsMenuRef}>
            <button
              type="button"
              onClick={() => setIsSectionsMenuOpen((isOpen) => !isOpen)}
              className="btn"
              title="Filter visible planner sections"
              aria-expanded={isSectionsMenuOpen}
              aria-controls="section-visibility-menu"
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                Sections
                {hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
              </span>
            </button>
            {isSectionsMenuOpen && (
              <div
                id="section-visibility-menu"
                className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-surface-border bg-surface-raised p-2 shadow-lg"
              >
                <p className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">
                  Show sections
                </p>
                <div className="space-y-1">
                  {sectionSettings.map((section) => {
                    const isVisible = !hiddenSectionIdSet.has(section.id);
                    return (
                      <label
                        key={section.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface"
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() =>
                            onToggleSectionVisibility?.(section.id)
                          }
                        />
                        <span>{section.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => newPlan()}
          className="btn"
          title="New plan"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New</span>
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="btn"
          title="Export all plans as JSON"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setImportError(null);
            fileInputRef.current?.click();
          }}
          className="btn"
          title="Import plans JSON"
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Import</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete plan "${plan.name}"?`)) deletePlan(plan.id);
          }}
          className="btn text-red-300 hover:text-red-200"
          title="Delete plan"
          aria-label="Delete plan"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
