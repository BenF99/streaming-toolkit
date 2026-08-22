"use client";

import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "@/components/ui/icons";

type Theme = "light" | "dark";

const STORAGE_KEY = "streaming-toolkit-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function systemTheme(): Theme {
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function getSnapshot(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : systemTheme();
}

function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(callback: () => void) {
  const media = window.matchMedia(MEDIA_QUERY);
  window.addEventListener("storage", callback);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    media.removeEventListener("change", callback);
  };
}

const ICONS: Record<Theme, typeof IconSun> = { light: IconSun, dark: IconMoon };
const LABELS: Record<Theme, string> = { light: "Light", dark: "Dark" };

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
    // storage events only fire in other tabs; notify this one directly.
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }

  const Icon = ICONS[theme];

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Theme: ${LABELS[theme]}. Click to switch to ${LABELS[theme === "dark" ? "light" : "dark"]}.`}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-medium text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-text"
    >
      <Icon />
      {LABELS[theme]}
    </button>
  );
}
