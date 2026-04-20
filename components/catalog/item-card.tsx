"use client";

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
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => onAddTarget?.(item.id)}
      title={`${item.name} — double-click to add as planner target`}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md border border-surface-border bg-surface-raised p-2 text-left transition hover:border-brand/60 hover:bg-surface-border",
        active && "border-brand bg-brand/10 hover:bg-brand/15",
      )}
    >
      <ItemIcon iconUrl={item.iconUrl} alt={item.name} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-100">
          {item.name}
        </div>
        <div className="truncate text-xs text-gray-500">{item.category}</div>
      </div>
    </button>
  );
}
