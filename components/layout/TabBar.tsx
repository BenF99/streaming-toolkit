export function TabBar() {
  return (
    <div className="flex items-center justify-between border-b border-border">
      <div role="tablist" aria-label="Toolkit sections" className="flex items-center gap-1">
        {/* px-1 grows the click target; -ml-1 cancels the resulting rightward shift so the text still lines up with the shell's left edge. */}
        <span role="tab" aria-selected="true" className="-mb-px -ml-1 border-b-2 border-accent px-1 pb-3 text-[13px] font-medium text-text">
          Exit Condition Builder
        </span>
      </div>
      <span className="pb-3 text-[11px] font-medium uppercase tracking-wide text-text-tertiary/60">More tools soon</span>
    </div>
  );
}
