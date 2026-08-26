import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { TabBar } from "./TabBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-5 py-8 sm:py-12">
      <div className="flex items-center justify-between gap-6">
        <span className="-ml-px text-[13px] font-medium text-text-tertiary">Streaming Toolkit</span>
        <ThemeToggle />
      </div>
      <TabBar />
      {children}
    </div>
  );
}
