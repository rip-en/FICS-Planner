"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface ItemIconProps {
  iconUrl?: string;
  alt: string;
  size?: number;
  className?: string;
}

export function ItemIcon({ iconUrl, alt, size = 32, className }: ItemIconProps) {
  const [broken, setBroken] = useState(false);
  if (!iconUrl || broken) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-sm bg-surface-border text-[10px] font-semibold text-gray-400",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={alt}
      >
        {alt.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <Image
      src={iconUrl}
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-sm", className)}
      onError={() => setBroken(true)}
      unoptimized
    />
  );
}
