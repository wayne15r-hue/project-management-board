"use client";

import { useId, useState, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const FloatingInput = forwardRef<HTMLInputElement, FloatingInputProps>(
  function FloatingInput({ label, error, id, className, onFocus, onBlur, value, ...props }, ref) {
    const autoId = useId();
    const inputId = id || autoId;
    const [focused, setFocused] = useState(false);
    const hasValue = typeof value === "string" ? value.length > 0 : Boolean(value);
    const floated = focused || hasValue;

    return (
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          value={value}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={cn(
            "peer h-12 w-full rounded-lg border border-border bg-background px-3 pt-4 pb-1 text-[14px] text-foreground outline-none transition-colors",
            "placeholder-transparent focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10",
            error && "border-destructive/60 focus:border-destructive focus:ring-destructive/20",
            className
          )}
          placeholder={label}
          {...props}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "pointer-events-none absolute left-3 text-muted-foreground transition-all",
            floated
              ? "top-1.5 text-[10.5px] font-medium uppercase tracking-wider"
              : "top-1/2 -translate-y-1/2 text-[13px]"
          )}
        >
          {label}
        </label>
        {error && (
          <p className="mt-1 text-[12px] text-destructive">{error}</p>
        )}
      </div>
    );
  }
);
