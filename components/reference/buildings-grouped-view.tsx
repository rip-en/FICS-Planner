"use client";

import { useMemo } from "react";
import { ItemIcon } from "@/components/item-icon";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { allBuildings } from "@/lib/data";
import { formatPower } from "@/lib/utils";
import type { Building } from "@/types/game";

const KIND_ORDER: Record<Building["kind"], number> = {
  extractor: 0,
  manufacturer: 1,
  generator: 2,
  other: 3,
};

const KIND_LABEL: Record<Building["kind"], string> = {
  extractor: "Extractors & miners",
  manufacturer: "Manufacturing",
  generator: "Power",
  other: "Other",
};

function groupByKind(buildings: Building[]) {
  const byKind = new Map<Building["kind"], Building[]>();
  for (const b of buildings) {
    if (b.kind === "other") continue;
    if (!byKind.has(b.kind)) byKind.set(b.kind, []);
    byKind.get(b.kind)!.push(b);
  }
  for (const list of byKind.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...byKind.entries()].sort(
    (a, b) => KIND_ORDER[a[0]] - KIND_ORDER[b[0]],
  );
}

export function BuildingsGroupedView() {
  const groups = useMemo(
    () => groupByKind(allBuildings()),
    [],
  );

  if (groups.length === 0) {
    return (
      <p className="text-sm text-gray-500">No buildings in the dataset.</p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([kind, list]) => (
        <CollapsibleSection
          key={kind}
          variant="panel"
          title={`${KIND_LABEL[kind]} · ${list.length}`}
          defaultOpen
          contentClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {list.map((b) => (
            <div key={b.id} className="card flex gap-3 p-3">
              <ItemIcon iconUrl={b.iconUrl} alt={b.name} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-medium">{b.name}</div>
                  <span className="chip capitalize">{b.kind}</span>
                </div>
                {b.powerConsumption !== 0 && (
                  <div className="text-xs text-gray-400">
                    {b.powerConsumption > 0 ? "Consumes " : "Produces "}
                    {formatPower(Math.abs(b.powerConsumption))}
                  </div>
                )}
                <p className="mt-1 line-clamp-3 text-xs text-gray-500">
                  {b.description}
                </p>
              </div>
            </div>
          ))}
        </CollapsibleSection>
      ))}
    </div>
  );
}
