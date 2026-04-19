import type { BoardBackground } from "@/types";

export interface BoardTheme {
  id: BoardBackground;
  label: string;
  preview: string;
  className: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: "default",
    label: "Default",
    preview: "linear-gradient(135deg, #FAF9F7 0%, #F5F3EE 100%)",
    className: "",
  },
  {
    id: "gradient-blue",
    label: "Ocean",
    preview: "linear-gradient(135deg, #DCEEFB 0%, #B7DCF6 100%)",
    className:
      "bg-[linear-gradient(135deg,#DCEEFB_0%,#B7DCF6_100%)] dark:bg-[linear-gradient(135deg,#0E2A47_0%,#0B1B30_100%)]",
  },
  {
    id: "gradient-purple",
    label: "Lavender",
    preview: "linear-gradient(135deg, #ECE6F8 0%, #D9CEF1 100%)",
    className:
      "bg-[linear-gradient(135deg,#ECE6F8_0%,#D9CEF1_100%)] dark:bg-[linear-gradient(135deg,#221E3B_0%,#181425_100%)]",
  },
  {
    id: "gradient-green",
    label: "Sage",
    preview: "linear-gradient(135deg, #E1EEDC 0%, #C7DEC0 100%)",
    className:
      "bg-[linear-gradient(135deg,#E1EEDC_0%,#C7DEC0_100%)] dark:bg-[linear-gradient(135deg,#15291C_0%,#0E1A14_100%)]",
  },
  {
    id: "dark",
    label: "Midnight",
    preview: "linear-gradient(135deg, #1F2433 0%, #131826 100%)",
    className:
      "bg-[linear-gradient(135deg,#1F2433_0%,#131826_100%)] text-white",
  },
];

export function getBoardThemeClass(theme: BoardBackground | null | undefined) {
  const t = BOARD_THEMES.find((b) => b.id === (theme ?? "default"));
  return t?.className ?? "";
}

export function getBoardTheme(theme: BoardBackground | null | undefined) {
  return BOARD_THEMES.find((b) => b.id === (theme ?? "default")) ?? BOARD_THEMES[0];
}
