"use client";

import { ThemeProvider as NextThemeProvider, useTheme as useNextTheme } from "next-themes";

type Theme = "light" | "dark" | "system";
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <NextThemeProvider attribute="class" storageKey="pm-board-theme" defaultTheme="system" enableSystem>{children}</NextThemeProvider>;
}
export function useTheme() {
  const { theme, resolvedTheme, setTheme } = useNextTheme();
  return {
    theme: (theme === "light" || theme === "dark" ? theme : "system") as Theme,
    resolvedTheme: resolvedTheme === "dark" ? "dark" as const : "light" as const,
    setTheme: (next: Theme) => setTheme(next),
  };
}
