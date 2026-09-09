"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme =
  | "light"
  | "dark"
  | "tokyo-night"
  | "nord"
  | "catppuccin-mocha"
  | "dracula"
  | "gruvbox-dark"
  | "solarized-light";

export interface ThemeInfo {
  value: Theme;
  label: string;
  /** Whether this theme is dark-family — drives the `dark` class so existing
   *  `dark:` Tailwind utility classes throughout the app stay correct. */
  isDark: boolean;
  /** Small swatch colors shown next to the theme name in the picker. */
  swatch: [string, string, string];
}

export const THEMES: ThemeInfo[] = [
  { value: "light", label: "Light", isDark: false, swatch: ["#ffffff", "#6366f1", "#e2e8f0"] },
  { value: "dark", label: "Dark", isDark: true, swatch: ["#0f172a", "#818cf8", "#334155"] },
  { value: "tokyo-night", label: "Tokyo Night", isDark: true, swatch: ["#1a1b26", "#7aa2f7", "#bb9af7"] },
  { value: "nord", label: "Nord", isDark: true, swatch: ["#2e3440", "#88c0d0", "#b48ead"] },
  { value: "catppuccin-mocha", label: "Catppuccin Mocha", isDark: true, swatch: ["#1e1e2e", "#cba6f7", "#f5c2e7"] },
  { value: "dracula", label: "Dracula", isDark: true, swatch: ["#282a36", "#bd93f9", "#ff79c6"] },
  { value: "gruvbox-dark", label: "Gruvbox Dark", isDark: true, swatch: ["#282828", "#fe8019", "#b8bb26"] },
  { value: "solarized-light", label: "Solarized Light", isDark: false, swatch: ["#fdf6e3", "#268bd2", "#cb4b16"] },
];

const STORAGE_KEY = "theme";

function isTheme(value: string | null): value is Theme {
  return THEMES.some((t) => t.value === value);
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isTheme(stored)) return stored;
  // Respect OS preference if no explicit choice stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const info = THEMES.find((t) => t.value === theme) ?? THEMES[0];
  root.classList.toggle("dark", info.isDark);
  // "light" and "dark" reuse the plain :root / html.dark palettes — no
  // data-theme needed. Named palettes (tokyo-night, ...) set it so their
  // `[data-theme="..."]` override block in globals.css takes effect.
  if (theme === "light" || theme === "dark") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

/**
 * Hook that manages the app theme (light / dark / tokyo-night, ...).
 * - Reads the initial theme from localStorage (or OS preference).
 * - Applies the `dark` class + `data-theme` attribute to `<html>` whenever
 *   the theme changes.
 * - Persists the user's choice to localStorage.
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  // Initializer runs once on the client — avoids a setState-in-effect lint error.
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Sync the <html> class/attribute whenever theme changes (including after hydration).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
