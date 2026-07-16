import type { AtlasTheme } from "./types.js";

function relativeLuminance(color: string): number {
  const channels = color.slice(1).match(/../g)?.map((value) => Number.parseInt(value, 16) / 255);
  if (!channels || channels.length !== 3 || channels.some((value) => !Number.isFinite(value))) throw new Error(`无效颜色: ${color}`);
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(first: string, second: string): number {
  const left = relativeLuminance(first);
  const right = relativeLuminance(second);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

export interface ThemeContrastIssue {
  role: string;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
}

export function themeContrastIssues(theme: AtlasTheme, minimum = 4.5): ThemeContrastIssue[] {
  const colors = [
    { role: "ink", color: theme.ink },
    { role: "mutedInk", color: theme.mutedInk },
    ...theme.palette.map((color, index) => ({ role: `palette[${index}]`, color })),
  ];
  return colors.flatMap(({ role, color }) => {
    const ratio = contrastRatio(color, theme.paper);
    return ratio + Number.EPSILON >= minimum ? [] : [{ role, foreground: color, background: theme.paper, ratio: Number(ratio.toFixed(2)), minimum }];
  });
}
