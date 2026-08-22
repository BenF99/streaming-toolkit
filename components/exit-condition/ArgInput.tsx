"use client";

import { useId } from "react";
import type { SelArgSpec } from "@/lib/exit-condition/catalog";
import { argLabel } from "@/lib/exit-condition/plain";
import type { ArgValue } from "@/lib/exit-condition/model";
import { ChainBuilder, newNestedChain } from "./ChainBuilder";
import { ButtonStructural, ButtonSubtle, Chip, Menu, MenuItem, Stepper, TextField, MenuTrigger } from "@/components/ui/primitives";
import { IconCheck, IconClose, IconPlus } from "@/components/ui/icons";

interface ArgInputProps {
  spec: SelArgSpec;
  value: ArgValue | undefined;
  onChange: (value: ArgValue) => void;
  depth: number;
}

function Label({ children }: { children: string }) {
  return <span className="text-[11px] font-medium text-text-tertiary">{argLabel(children)}</span>;
}

export function ArgInput({ spec, value, onChange, depth }: ArgInputProps) {
  const inputId = useId();
  // --- Streams args: nested chain builder(s) ---
  if (spec.type === "streams") {
    if (spec.variadic) {
      const chains = value?.kind === "chainList" ? value.chains : [];
      return (
        <div className="flex flex-col gap-2">
          <Label>{spec.name}</Label>
          <div className="flex flex-col gap-2">
            {chains.map((c, i) => (
              <ChainBuilder
                key={c.id}
                chain={c}
                depth={depth + 1}
                onChange={(next) => {
                  const copy = chains.slice();
                  copy[i] = next;
                  onChange({ kind: "chainList", chains: copy });
                }}
                onRemove={() => onChange({ kind: "chainList", chains: chains.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
          <ButtonStructural className="self-start" onClick={() => onChange({ kind: "chainList", chains: [...chains, newNestedChain()] })}>
            <IconPlus className="h-3 w-3" /> Add stream list
          </ButtonStructural>
        </div>
      );
    }
    const chain = value?.kind === "chain" ? value.chain : newNestedChain();
    return (
      <div className="flex flex-col gap-2">
        <Label>{spec.name}</Label>
        <ChainBuilder chain={chain} depth={depth + 1} onChange={(next) => onChange({ kind: "chain", chain: next })} />
      </div>
    );
  }

  // --- Enum (fixed options), single or variadic ---
  if (spec.options && spec.options.length > 0) {
    if (spec.variadic) {
      const selected = value?.kind === "list" ? value.values : [];
      const summary = selected.length ? selected.join(", ") : "Choose values";
      return (
        <div className="flex flex-col gap-1">
          <Label>{spec.name}</Label>
          <Menu trigger={<MenuTrigger className="max-w-[220px] truncate">{summary}</MenuTrigger>}>
            {(close) => (
              <div className="flex flex-col">
                {spec.options!.map((opt) => {
                  const active = selected.includes(opt);
                  return (
                    <MenuItem
                      key={opt}
                      onSelect={() =>
                        onChange({
                          kind: "list",
                          values: active ? selected.filter((v) => v !== opt) : [...selected, opt],
                        })
                      }
                    >
                      <span>{opt}</span>
                      {active && <IconCheck className="h-3 w-3 text-accent" />}
                    </MenuItem>
                  );
                })}
                {/* Multi-select stays open across picks, so it needs an explicit way to close.
                    -bottom-2 cancels the menu's own padding so no sliver of list shows under the bar. */}
                <div className="sticky -bottom-2 -mx-2 -mb-2 mt-1 flex justify-end border-t border-border bg-surface px-2 py-1">
                  <ButtonSubtle onClick={close}>Done</ButtonSubtle>
                </div>
              </div>
            )}
          </Menu>
        </div>
      );
    }
    const current = value?.kind === "scalar" ? value.value : spec.defaultValue ?? "";
    return (
      <div className="flex flex-col gap-1">
        <Label>{spec.name}</Label>
        <Menu trigger={<MenuTrigger>{current || "Choose"}</MenuTrigger>}>
          {(close) => (
            <div className="flex flex-col">
              {spec.options!.map((opt) => (
                <MenuItem
                  key={opt}
                  onSelect={() => {
                    onChange({ kind: "scalar", value: opt });
                    close();
                  }}
                >
                  <span>{opt}</span>
                  {current === opt && <IconCheck className="h-3 w-3 text-accent" />}
                </MenuItem>
              ))}
            </div>
          )}
        </Menu>
      </div>
    );
  }

  // --- Boolean toggle ---
  if (spec.type === "boolean") {
    const current = value?.kind === "scalar" ? value.value === "true" : spec.defaultValue === "true";
    return (
      <div className="flex flex-col gap-1">
        <Label>{spec.name}</Label>
        <Chip selected={current} tone="accent" onClick={() => onChange({ kind: "scalar", value: current ? "false" : "true" })}>
          {current ? "true" : "false"}
        </Chip>
      </div>
    );
  }

  // --- Number: stepper ---
  if (spec.type === "number") {
    const current = value?.kind === "scalar" ? value.value : spec.defaultValue ?? "";
    return <Stepper label={argLabel(spec.name)} value={current} onChange={(v) => onChange({ kind: "scalar", value: v })} placeholder={spec.placeholder} min={spec.min} max={spec.max} />;
  }

  // --- Free-form string, single or variadic (chip input) ---
  if (spec.variadic) {
    const values = value?.kind === "list" ? value.values : [];
    return (
      <div className="flex flex-col gap-1">
        <Label>{spec.name}</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {values.map((v, i) => (
            <span key={i} className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[12px] text-text">
              {v}
              <button type="button" aria-label={`Remove ${v}`} className="text-text-tertiary hover:text-danger" onClick={() => onChange({ kind: "list", values: values.filter((_, j) => j !== i) })}>
                <IconClose className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <input
            id={inputId}
            name={inputId}
            type="text"
            autoComplete="off"
            aria-label={argLabel(spec.name)}
            placeholder={spec.placeholder ?? "Add value…"}
            className="h-7 w-28 rounded-full border border-border bg-surface-2 px-2.5 text-[12px] text-text outline-none placeholder:text-text-tertiary focus-visible:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const input = e.currentTarget;
                const v = input.value.trim();
                if (v) {
                  onChange({ kind: "list", values: [...values, v] });
                  input.value = "";
                }
              }
            }}
          />
        </div>
      </div>
    );
  }

  const current = value?.kind === "scalar" ? value.value : "";
  return <TextField label={argLabel(spec.name)} value={current} placeholder={spec.placeholder ?? spec.name} onChange={(v) => onChange({ kind: "scalar", value: v })} />;
}
