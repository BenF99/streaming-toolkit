"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { SelProblem } from "@/lib/exit-condition/validity";
import { ButtonPrimary, ButtonSubtle, Card, Note, TextField } from "@/components/ui/primitives";
import { ChangingText } from "@/components/ui/ChangingText";
import { IconCheck, IconCopy } from "@/components/ui/icons";

interface ReadoutProps {
  value: string;
  complete: boolean;
  /** A logical fault somewhere in the expression, or null when it is merely unfinished. */
  problem: SelProblem | null;
  name: string;
  onNameChange: (name: string) => void;
  /** Read typed or pasted SEL back into the builder. Returns the reason it couldn't, if it couldn't. */
  onEdit: (text: string) => { ok: true } | { ok: false; error: string };
  /** Remember the tree as it stands, so an abandoned edit can put it back. */
  onEditStart: () => void;
  /** Abandon the edit and restore the remembered tree. */
  onEditCancel: () => void;
  /** Clear the whole expression. Omitted when there is nothing to clear. */
  onReset?: () => void;
}

export function Readout({ value, complete, problem, name, onNameChange, onEdit, onEditStart, onEditCancel, onReset }: ReadoutProps) {
  const [copied, setCopied] = useState(false);
  const editorId = useId();

  // `draft` survives losing focus while unreadable, so a half-finished edit isn't thrown away;
  // once it reads cleanly, letting go snaps to the canonical rendering.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editing = draft !== null;

  function beginEditing() {
    if (editing) return;
    onEditStart();
    setDraft(value);
    setError(null);
  }

  useEffect(() => {
    const node = editor.current;
    if (!node) return;
    if (document.activeElement !== node) node.focus();
    // Grow to fit rather than scroll: the whole expression should be visible while it is edited.
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft]);

  function handleDraft(text: string) {
    setDraft(text);
    const result = onEdit(text);
    setError(result.ok ? null : result.error);
  }

  function handleBlur() {
    if (error === null) {
      setDraft(null);
      setError(null);
    }
  }

  // A change made elsewhere (e.g. removing a function) retires a stale draft, since it no longer
  // describes the tree. Guarded on focus: while typing, the draft is the newer of the two.
  const shown = useRef(value);
  useEffect(() => {
    const changedElsewhere = value !== shown.current && document.activeElement !== editor.current;
    shown.current = value;
    if (draft !== null && changedElsewhere) {
      setDraft(null);
      setError(null);
    }
  }, [value, draft]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onEditCancel();
      setDraft(null);
      setError(null);
      editor.current?.blur();
    }
  }

  // Only pop on the transition into completeness, never on the way out or on first paint.
  const wasComplete = useRef(complete);
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    if (complete && !wasComplete.current) setJustCompleted(true);
    wasComplete.current = complete;
  }, [complete]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="soft-shadow p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            key={justCompleted ? "complete" : "idle"}
            onAnimationEnd={() => setJustCompleted(false)}
            className={`h-2 w-2 rounded-full transition-colors duration-300 ${problem ? "bg-danger" : complete ? "bg-success" : "bg-text-tertiary/50"} ${justCompleted ? "animate-dot-pop" : ""}`}
          />
          <span className={`text-[12px] font-medium transition-colors duration-300 ${problem ? "text-danger" : "text-text-secondary"}`}>
            {problem ? "Won't work" : complete ? "Valid expression" : "Incomplete"}
          </span>
        </div>
        <TextField ariaLabel="Expression name" value={name} onChange={onNameChange} placeholder="Name (optional)" />
      </div>

      {problem && <Note tone="problem">{problem.summary}</Note>}

      {/* Focus ring on the container, not the textarea (see globals.css) - keeps it as the
          card's own edge, not a system outline around a full-width dark panel. */}
      <div
        className={`rounded-xl bg-code-bg px-4 py-4 transition-shadow duration-150 ${editing ? "ring-1 ring-white/25" : "cursor-text hover:ring-1 hover:ring-border-strong"}`}
        onClick={beginEditing}
      >
        {editing ? (
          <textarea
            ref={editor}
            id={editorId}
            name={editorId}
            aria-label="Expression"
            spellCheck={false}
            value={draft}
            onChange={(e) => handleDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="focus-ring-none block w-full resize-none overflow-hidden whitespace-pre-wrap break-all bg-transparent font-mono text-[15px] leading-relaxed text-code-text sm:text-[16px]"
          />
        ) : (
          <code className="block whitespace-pre-wrap break-all font-mono text-[15px] leading-relaxed text-code-text sm:text-[16px]">
            <ChangingText value={value} empty={<span className="text-code-dim">Add a condition, or paste an expression here</span>} />
          </code>
        )}
      </div>

      {editing && (
        <p className={`pt-2 text-[11px] leading-relaxed ${error ? "text-danger" : "text-text-tertiary"}`} role={error ? "status" : undefined}>
          {error ?? "Reading it into the builder as you type. Escape to undo."}
        </p>
      )}

      {/* Reset and Copy both act on the expression as a whole; Reset stays at the opposite end
          since it throws work away. */}
      <div className="flex items-center justify-between gap-3 pt-3">
        {onReset ? (
          <ButtonSubtle onClick={onReset} title="Clear everything and start again">
            Reset
          </ButtonSubtle>
        ) : (
          <span />
        )}
        <ButtonPrimary onClick={handleCopy} disabled={!complete}>
          <span key={copied ? "copied" : "idle"} className="animate-swap-in inline-flex items-center gap-1.5">
            {copied ? (
              <>
                <IconCheck className="h-3.5 w-3.5" /> Copied
              </>
            ) : (
              <>
                <IconCopy className="h-3.5 w-3.5" /> Copy expression
              </>
            )}
          </span>
        </ButtonPrimary>
      </div>
    </Card>
  );
}
