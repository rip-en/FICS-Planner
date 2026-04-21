"use client";

import { Plus } from "lucide-react";
import type { Item } from "@/types/game";
import { ItemIcon } from "@/components/item-icon";
import { cn } from "@/lib/utils";

interface ItemCardProps {
  item: Item;
  active?: boolean;
  onSelect: (itemId: string) => void;
  onAddTarget?: (itemId: string) => void;
}

export function ItemCard({ item, active, onSelect, onAddTarget }: ItemCardProps) {
  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 rounded-md border border-surface-border bg-surface-raised p-2 text-left transition hover:border-brand/60 hover:bg-surface-border",
        active && "border-brand bg-brand/10 hover:bg-brand/15",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        onDoubleClick={() => onAddTarget?.(item.id)}
        aria-current={active ? "true" : undefined}
        title={`${item.name} — tap for details, double-click to add as target`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <ItemIcon iconUrl={item.iconUrl} alt={item.name} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-100">
            {item.name}
          </div>
          <div className="truncate text-xs text-gray-500">{item.category}</div>
        </div>
      </button>
      {onAddTarget && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddTarget(item.id);
          }}
          className="btn btn-primary shrink-0 touch-manipulation px-2 py-2 sm:py-1.5"
          aria-label={`Add ${item.name} as production target`}
          title="Add as production target"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
