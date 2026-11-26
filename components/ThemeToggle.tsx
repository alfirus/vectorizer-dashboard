"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export const THEME_KEY = "vectorizer-theme";

export function currentTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  // First visit: follow the OS; fall back to dark (historical default).
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function applyTheme(t: "dark" | "light") {
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    setReady(true);
  }, []);

  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  };

  return (
    <button
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "w-11 h-11 rounded-xl bg-surface border border-border flex items-center justify-center shrink-0",
        "hover:border-primary/40 active:scale-95 transition-all",
        !ready && "opacity-0",
        className
      )}
    >
      {theme === "dark" ? (
        <Sun className="w-[18px] h-[18px] text-muted-2" />
      ) : (
        <Moon className="w-[18px] h-[18px] text-muted-2" />
      )}
    </button>
  );
}
