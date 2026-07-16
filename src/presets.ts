import type { AtlasSpec, AtlasTheme } from "./types.js";

export const themePresets = {
  "paper-color": {
    label: "纸张彩墨",
    description: "默认暖纸、水彩洗色和深蓝墨线",
    theme: {
      name: "paper-color", paper: "#F6EEDD", ink: "#243B56", mutedInk: "#5F625E",
      palette: ["#B04A37", "#1E7772", "#3569A7", "#906314", "#705B98"],
      titleFont: "STKaiti, KaiTi, serif", bodyFont: "STKaiti, KaiTi, Microsoft YaHei, Noto Sans CJK SC, serif",
      texture: 0.52, handDrawn: 0.9,
    },
  },
  blueprint: {
    label: "工程蓝图",
    description: "深海军蓝底、浅色线稿和克制的工程标记",
    theme: {
      name: "blueprint", paper: "#102A43", ink: "#E8F1F5", mutedInk: "#A8C0CC",
      palette: ["#E08E79", "#75B5B1", "#79A9D1", "#D4B06A", "#A597C7"],
      titleFont: "Microsoft YaHei, Noto Sans CJK SC, sans-serif", bodyFont: "Microsoft YaHei, Noto Sans CJK SC, sans-serif",
      texture: 0.3, handDrawn: 0.48,
    },
  },
  whiteboard: {
    label: "白板马克笔",
    description: "清爽白底、高对比墨色和轻量手写感",
    theme: {
      name: "whiteboard", paper: "#F7F8F4", ink: "#26333B", mutedInk: "#667078",
      palette: ["#B04A37", "#1E7772", "#3D6EA8", "#906314", "#75659B"],
      titleFont: "Microsoft YaHei, Noto Sans CJK SC, sans-serif", bodyFont: "Microsoft YaHei, Noto Sans CJK SC, sans-serif",
      texture: 0.12, handDrawn: 0.64,
    },
  },
  "ink-wash": {
    label: "水墨朱砂",
    description: "宣纸、中性墨色和单点朱砂强调",
    theme: {
      name: "ink-wash", paper: "#F3EFE4", ink: "#202A2E", mutedInk: "#626866",
      palette: ["#A64B3C", "#566F6A", "#405A70", "#755C35", "#6D6572"],
      titleFont: "STKaiti, KaiTi, serif", bodyFont: "STKaiti, KaiTi, Microsoft YaHei, Noto Sans CJK SC, serif",
      texture: 0.68, handDrawn: 0.94,
    },
  },
} satisfies Record<string, { label: string; description: string; theme: AtlasTheme }>;

export const canvasPresets = {
  presentation: { label: "演示文稿 16:9", width: 1600, height: 900 },
  article: { label: "文章横图 8:5", width: 1600, height: 1000 },
  wechat: { label: "公众号宽图 16:9", width: 1200, height: 675 },
  square: { label: "方形社交图", width: 1200, height: 1200 },
  "print-a4": { label: "A4 横版", width: 1754, height: 1240 },
} as const;

export type ThemePresetName = keyof typeof themePresets;
export type CanvasPresetName = keyof typeof canvasPresets;

export function applyThemePreset(spec: AtlasSpec, name: string): AtlasSpec {
  const preset = themePresets[name as ThemePresetName];
  if (!preset) throw new Error(`未知主题预设: ${name}。可用值: ${Object.keys(themePresets).join(", ")}`);
  spec.theme = structuredClone(preset.theme);
  spec.groups = spec.groups.map((group, index) => ({ ...group, color: preset.theme.palette[index % preset.theme.palette.length] }));
  spec.nodes = spec.nodes.map((node) => ({ ...node, color: undefined }));
  spec.edges = spec.edges.map((edge) => ({ ...edge, color: undefined }));
  spec.notes = spec.notes?.map((note, index) => ({ ...note, color: preset.theme.palette[index % preset.theme.palette.length] }));
  return spec;
}

export function applyCanvasPreset(spec: AtlasSpec, name: string): AtlasSpec {
  const preset = canvasPresets[name as CanvasPresetName];
  if (!preset) throw new Error(`未知画布预设: ${name}。可用值: ${Object.keys(canvasPresets).join(", ")}`);
  spec.canvas.width = preset.width;
  spec.canvas.height = preset.height;
  return spec;
}

export function presetCatalog(): Record<string, unknown> {
  return {
    themes: Object.entries(themePresets).map(([id, preset]) => ({ id, label: preset.label, description: preset.description, paper: preset.theme.paper, ink: preset.theme.ink, palette: preset.theme.palette })),
    canvases: Object.entries(canvasPresets).map(([id, preset]) => ({ id, ...preset })),
  };
}
