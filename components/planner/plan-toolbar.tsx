"use client";

import {
  Check,
  Download,
  Plus as PlusIcon,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef } from "react";
import { APP_NAME } from "@/lib/brand";
import { usePlannerStore, type SavedPlan } from "@/lib/store/planner-store";
import type { PlannerConfig } from "@/lib/planner/types";

interface ExportShape {
  version: 1;
  plans: Record<string, SavedPlan>;
  activePlanId: string;
}

export function PlanToolbar() {
  const plans = usePlannerStore((s) => s.plans);
  const activePlanId = usePlannerStore((s) => s.activePlanId);
  const rename = usePlannerStore((s) => s.renamePlan);
  const newPlan = usePlannerStore((s) => s.newPlan);
  const switchPlan = usePlannerStore((s) => s.switchPlan);
  const deletePlan = usePlannerStore((s) => s.deletePlan);
  const setObjective = usePlannerStore((s) => s.setObjective);
  const replacePlans = usePlannerStore((s) => s.replacePlans);
  const clearRecipeOverrides = usePlannerStore((s) => s.clearRecipeOverrides);
  const plan = plans[activePlanId];
  const overrideCount =
    (plan?.config.enabledAlternates.length ?? 0) +
    (plan?.config.disabledRecipes.length ?? 0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ExportShape;
      if (!parsed.plans || typeof parsed.plans !== "object") {
        throw new Error("bad file");
      }
      const planIds = Object.keys(parsed.plans);
      if (planIds.length === 0) throw new Error("bad file");
      const activePlanId = parsed.plans[parsed.activePlanId]
        ? parsed.activePlanId
        : planIds[0];
      replacePlans(parsed.plans, activePlanId);
    } catch {
      alert("Could not import that file.");
    }
  };

  const plansSorted = Object.values(plans).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  return (
    <div className="card flex flex-col gap-2 p-2 lg:flex-row lg:items-center">
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
          onClick={() => fileInputRef.current?.click()}
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
