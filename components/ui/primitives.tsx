"use client";

import { useRef } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

const BUTTON_VARIANTS = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "text-brand hover:bg-brand-soft",
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
}

/** A button that opens a file picker and hands back the chosen file. */
export function FileButton({
  accept,
  disabled,
  onFile,
  children,
}: {
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  children: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-brand"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

/** Horizontal score bar coloured green / amber / red by value. */
export function ScoreBar({ percent }: { percent: number }) {
  const color = percent < 35 ? "bg-emerald-500" : percent < 65 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-100" role="meter" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
    </div>
  );
}

/**
 * A clickable run of text that wraps like the prose around it (a <button>
 * would be inline-block and break the paragraph into boxes).
 */
export function InlineSegment({
  onSelect,
  className = "",
  title,
  children,
}: {
  onSelect: () => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      title={title}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`cursor-pointer rounded-sm px-0.5 underline decoration-2 underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`}
    >
      {children}
    </span>
  );
}

export const textareaClass =
  "w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export const selectClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
