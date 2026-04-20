"use client";

import { Search, X } from "lucide-react";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export interface SearchInputHandle {
  focus: () => void;
  select: () => void;
}

export interface SearchInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value" | "size"
  > {
  value: string;
  onChange: (value: string) => void;
  /** Optional keyboard hint rendered on the right when empty (e.g. "/"). */
  hint?: string;
  /** Accessible label - also used as default placeholder. */
  label: string;
  size?: "sm" | "md";
}

/**
 * A self-contained search field. Icon, clear button, and keyboard hint are
 * positioned inside the input's own flex row so they always line up - no more
 * absolute-positioning math relative to a padded ancestor.
 */
export const SearchInput = forwardRef<SearchInputHandle, SearchInputProps>(
  function SearchInput(
    {
      value,
      onChange,
      hint,
      label,
      size = "md",
      placeholder,
      className,
      ...rest
    },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      select: () => inputRef.current?.select(),
    }));

    const isActive = value.length > 0;
    const heightCls = size === "sm" ? "h-8" : "h-9";
    const iconCls = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

    return (
      <div
        className={cn(
          "group relative flex items-center gap-2 rounded-md border bg-surface-raised px-2 transition",
          heightCls,
          isActive
            ? "border-brand/40 shadow-[0_0_0_1px_rgb(249_168_37_/_0.15)]"
            : "border-surface-border hover:border-gray-500/60",
          "focus-within:border-brand focus-within:shadow-[0_0_0_2px_rgb(249_168_37_/_0.25)]",
          className,
        )}
      >
        <Search
          className={cn(
            "shrink-0 text-gray-500 transition",
            iconCls,
            "group-focus-within:text-brand",
          )}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          aria-label={label}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-500",
            // Disable browser's default search clear button (we render our own).
            "[&::-webkit-search-cancel-button]:appearance-none",
          )}
          {...rest}
        />
        {isActive ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="rounded p-0.5 text-gray-500 transition hover:bg-surface hover:text-gray-200"
            aria-label="Clear search"
          >
            <X className={iconCls} />
          </button>
        ) : hint ? (
          <kbd className="hidden shrink-0 rounded border border-surface-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-gray-500 sm:inline">
            {hint}
          </kbd>
        ) : null}
      </div>
    );
  },
);
