"use client";

import { Check, Moon, Palette, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEMES, useTheme, type Theme } from "@/hooks/useTheme";

const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  "tokyo-night": Palette,
};

/**
 * Theme picker button. Reads/sets the app theme via useTheme() and shows a
 * dropdown of available palettes (light, dark, tokyo-night, ...), each with
 * a small swatch preview.
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const ActiveIcon = THEME_ICONS[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Change theme"
          title="Change theme"
          className="h-8 w-8"
        >
          <ActiveIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {THEMES.map((t) => (
          <DropdownMenuItem key={t.value} onClick={() => setTheme(t.value)} className="justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="flex shrink-0 overflow-hidden rounded-full ring-1 ring-border">
                {t.swatch.map((color, i) => (
                  <span key={i} className="h-3.5 w-2" style={{ background: color }} />
                ))}
              </span>
              {t.label}
            </span>
            {theme === t.value && <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
