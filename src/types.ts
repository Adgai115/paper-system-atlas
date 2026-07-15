export type LayoutMode = "layered" | "lanes" | "radial";

export interface AtlasCanvas {
  width: number;
  height: number;
  fps: number;
  frames: number;
}

export interface AtlasTheme {
  name: string;
  paper: string;
  ink: string;
  mutedInk: string;
  palette: string[];
  titleFont: string;
  bodyFont: string;
  texture: number;
  handDrawn: number;
}

export interface AtlasGroup {
  id: string;
  title: string;
  note?: string;
  color?: string;
}

export interface AtlasNode {
  id: string;
  group: string;
  title: string;
  description?: string;
  icon?: "chat" | "calendar" | "voice" | "document" | "target" | "plan" | "route" | "shield" | "browser" | "knowledge" | "code" | "media" | "report" | "message" | "dashboard" | "archive" | "memory";
  color?: string;
}

export interface AtlasEdge {
  from: string;
  to: string;
  label?: string;
  color?: string;
  animated?: boolean;
  kind?: "signal" | "task" | "result" | "feedback";
}

export interface AtlasNote {
  text: string;
  anchor?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  color?: string;
}

export interface AtlasSpec {
  meta: {
    title: string;
    subtitle?: string;
    description?: string;
    language?: string;
  };
  canvas: AtlasCanvas;
  layout: {
    mode: LayoutMode;
    direction: "horizontal" | "vertical";
    profile?: "adaptive" | "atlas-showcase";
  };
  theme: AtlasTheme;
  groups: AtlasGroup[];
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  notes?: AtlasNote[];
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNode extends AtlasNode {
  box: Box;
}

export interface LayoutGroup extends AtlasGroup {
  box: Box;
  color: string;
  index: number;
}

export interface LayoutEdge extends AtlasEdge {
  color: string;
  path: [number, number][];
}

export interface Scene {
  spec: AtlasSpec;
  groups: LayoutGroup[];
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

export interface RenderOptions {
  animatedSvg?: boolean;
  frameProgress?: number;
}
