"use client";

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { IconChevronDown } from "./icons";

export function ButtonPrimary({ className = "", disabled, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-accent px-5 text-[14px] font-medium text-accent-ink transition-colors duration-150",
        "hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ButtonSubtle({ className = "", selected, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={[
        "inline-flex h-8 items-center justify-center gap-1 rounded-full px-3 text-[13px] font-medium transition-colors duration-150",
        selected ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-black/[0.04] hover:text-text dark:hover:bg-white/[0.06]",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

export function structuralButtonClass(className = ""): string {
  return [
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-dashed border-border-strong px-3.5 text-[12.5px] font-medium text-text-secondary transition-colors duration-150",
    "hover:border-accent hover:text-accent",
    className,
  ].join(" ");
}

export function ButtonStructural({ className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={structuralButtonClass(className)} {...rest}>
      {children}
    </button>
  );
}

export function Chip({ className = "", selected, tone = "neutral", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; tone?: "neutral" | "accent" }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={[
        "inline-flex h-8 items-center justify-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150",
        selected
          ? tone === "accent"
            ? "border-accent bg-accent text-accent-ink"
            : "border-text bg-text text-bg"
          : "border-border text-text-secondary hover:border-border-strong hover:text-text",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Note({ tone = "neutral", children }: { tone?: "neutral" | "problem"; children: ReactNode }) {
  return (
    <p role={tone === "problem" ? "status" : undefined} className={`text-[11px] leading-relaxed ${tone === "problem" ? "text-danger" : "text-text-tertiary"}`}>
      {children}
    </p>
  );
}

/** A fault next to the control that caused it: what is wrong, then what to do about it. */
export function ProblemNote({ problem }: { problem: { summary: string; fix: string } }) {
  return (
    <Note tone="problem">
      {problem.summary} <span className="text-text-secondary">{problem.fix}</span>
    </Note>
  );
}

// --- Card ----------------------------------------------------------------

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl border border-border bg-surface ${className}`}>{children}</div>;
}

// --- Popover menu ----------------------------------------------------------

export function Menu({
  trigger,
  children,
  align = "start",
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex align-middle">
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={[
            "animate-fade-in absolute z-20 mt-2 max-h-80 w-72 overflow-y-auto rounded-2xl border border-border bg-surface p-2 soft-shadow-lg",
            align === "end" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuTrigger({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={[
        "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 text-[13px] font-medium text-text transition-colors duration-150 hover:border-border-strong",
        className,
      ].join(" ")}
    >
      {children}
      <IconChevronDown className="h-3 w-3 text-text-tertiary" />
    </span>
  );
}

/** The one chevron in the system: press to show more, always. Rows with nothing to reveal get
 * DisclosureSpacer instead, so the chevron never appears inert. */
export function Disclosure({ open, onToggle, label, className = "" }: { open: boolean; onToggle: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
      className={`-m-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full p-1 text-text-tertiary transition-colors duration-150 hover:bg-black/[0.05] hover:text-text dark:hover:bg-white/[0.08] ${className}`}
    >
      <IconChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
    </button>
  );
}

/** Holds a disclosure's place in the gutter for a row that has nothing to disclose. */
export function DisclosureSpacer() {
  return (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">
      <span className="h-1 w-1 rounded-full bg-text-tertiary/40" />
    </span>
  );
}

/** A choice named by its SEL identifier (what lands in the expression), with the plain-English
 * gloss underneath. */
export function NameWithGloss({ name, gloss }: { name: string; gloss?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-mono text-[13px] text-text">{name}</span>
      {gloss && <span className="truncate text-[11px] text-text-secondary">{gloss}</span>}
    </span>
  );
}

export function MenuGroupLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary first:pt-1">{children}</div>;
}

export function MenuItem({ children, onSelect, description }: { children: ReactNode; onSelect: () => void; description?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      title={description}
      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] text-text transition-colors duration-100 hover:bg-black/[0.045] dark:hover:bg-white/[0.07]"
    >
      {children}
    </button>
  );
}

// --- Stepper (numeric) -----------------------------------------------------

/** `min`/`max` are parser-enforced bounds; clamped here rather than reported afterwards. */
export function Stepper({ label, value, onChange, placeholder, min, max }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; min?: number; max?: number }) {
  const id = useId();
  const num = value.trim() === "" ? undefined : Number(value);

  function clamp(n: number): number {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  }

  function commit(raw: string) {
    // Empty stays empty rather than clamping to min, which would silently answer for the user.
    if (raw.trim() === "") return onChange("");
    const parsed = Number(raw);
    onChange(Number.isNaN(parsed) ? raw : String(clamp(parsed)));
  }

  function step(delta: number) {
    const base = num === undefined || Number.isNaN(num) ? (min ?? 0) : num;
    onChange(String(clamp(base + delta)));
  }

  const atMin = min !== undefined && num !== undefined && num <= min;
  const atMax = max !== undefined && num !== undefined && num >= max;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-medium text-text-tertiary">
        {label}
      </label>
      <div className="inline-flex h-8 items-center overflow-hidden rounded-full border border-border bg-surface-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={atMin}
          onClick={() => step(-1)}
          className="flex h-full w-7 items-center justify-center text-text-secondary hover:bg-black/[0.05] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/[0.08]"
        >
          −
        </button>
        <input
          id={id}
          name={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          placeholder={placeholder ?? "0"}
          onChange={(e) => commit(e.target.value.replace(/[^0-9.-]/g, ""))}
          className="tabular w-12 border-x border-border bg-transparent text-center text-[13px] text-text outline-none"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={atMax}
          onClick={() => step(1)}
          className="flex h-full w-7 items-center justify-center text-text-secondary hover:bg-black/[0.05] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/[0.08]"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function TextField({ label, ariaLabel, value, onChange, placeholder }: { label?: string; ariaLabel?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-[11px] font-medium text-text-tertiary">
          {label}
        </label>
      )}
      <input
        id={id}
        name={id}
        type="text"
        autoComplete="off"
        aria-label={!label ? ariaLabel : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-full border border-border bg-surface-2 px-3 text-[13px] text-text outline-none placeholder:text-text-tertiary focus-visible:border-accent"
      />
    </div>
  );
}
