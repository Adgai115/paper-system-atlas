import type { Box, Scene } from "./types.js";

type Element = Record<string, unknown>;

function elementBase(id: string, type: string, box: Box, stroke: string, background = "transparent", roughness = 1): Element {
  return {
    id,
    type,
    x: Math.round(box.x * 100) / 100,
    y: Math.round(box.y * 100) / 100,
    width: Math.round(box.width * 100) / 100,
    height: Math.round(box.height * 100) / 100,
    angle: 0,
    strokeColor: stroke,
    backgroundColor: background,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: `a${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`,
    roundness: type === "rectangle" ? { type: 3 } : type === "arrow" ? { type: 2 } : null,
    seed: Math.abs([...id].reduce((value, char) => (value * 31 + char.charCodeAt(0)) | 0, 17)) || 1,
    version: 1,
    versionNonce: Math.abs([...id].reduce((value, char) => (value * 37 + char.charCodeAt(0)) | 0, 23)) || 1,
    isDeleted: false,
    boundElements: null,
    updated: Date.UTC(2026, 0, 1),
    link: null,
    locked: false,
  };
}

function textElement(id: string, text: string, x: number, y: number, width: number, height: number, fontSize: number, color: string, align: "left" | "center" = "left"): Element {
  return {
    ...elementBase(id, "text", { x, y, width, height }, color, "transparent", 0),
    text,
    originalText: text,
    fontSize,
    fontFamily: 5,
    textAlign: align,
    verticalAlign: "top",
    baseline: Math.round(fontSize * 1.25),
    containerId: null,
    lineHeight: 1.25,
  };
}

export function renderExcalidraw(scene: Scene): string {
  const elements: Element[] = [];
  const { spec } = scene;
  elements.push(textElement("title-main", spec.meta.title, 64, 34, spec.canvas.width * 0.55, 62, 44, spec.theme.ink));
  if (spec.meta.subtitle) elements.push(textElement("title-subtitle", spec.meta.subtitle, 66, 98, spec.canvas.width * 0.5, 32, 18, spec.theme.mutedInk));

  for (const group of scene.groups) {
    const box = group.box;
    const outline = elementBase(`group-${group.id}`, "rectangle", box, group.color, "transparent", 1);
    outline.strokeStyle = "dashed";
    outline.strokeWidth = 2;
    elements.push(outline);
    elements.push(textElement(`group-${group.id}-index`, String(group.index + 1), box.x + 12, box.y + 12, 28, 28, 21, group.color, "center"));
    elements.push(textElement(`group-${group.id}-title`, group.title, box.x + 50, box.y + 14, box.width - 68, 34, 25, group.color));
    if (group.note) elements.push(textElement(`group-${group.id}-note`, group.note, box.x + 20, box.y + 49, box.width - 40, 22, 12, spec.theme.mutedInk));
  }

  for (const edge of scene.edges) {
    const [start, c1, c2, end] = edge.path;
    const samples: [number, number][] = Array.from({ length: 9 }, (_, index) => {
      const t = index / 8;
      const u = 1 - t;
      return [
        u ** 3 * start[0] + 3 * u ** 2 * t * c1[0] + 3 * u * t ** 2 * c2[0] + t ** 3 * end[0],
        u ** 3 * start[1] + 3 * u ** 2 * t * c1[1] + 3 * u * t ** 2 * c2[1] + t ** 3 * end[1],
      ];
    });
    const minX = Math.min(...samples.map(([x]) => x));
    const minY = Math.min(...samples.map(([, y]) => y));
    const maxX = Math.max(...samples.map(([x]) => x));
    const maxY = Math.max(...samples.map(([, y]) => y));
    const arrow = elementBase(`edge-${edge.from}-${edge.to}`, "arrow", { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, edge.color, "transparent", 1);
    arrow.points = samples.map(([x, y]) => [Math.round((x - minX) * 100) / 100, Math.round((y - minY) * 100) / 100]);
    arrow.startBinding = null;
    arrow.endBinding = null;
    arrow.startArrowhead = null;
    arrow.endArrowhead = "arrow";
    elements.push(arrow);
  }

  for (const node of scene.nodes) {
    const group = scene.groups.find((item) => item.id === node.group)!;
    const color = node.color ?? group.color;
    elements.push(elementBase(`node-${node.id}`, "rectangle", node.box, color, spec.theme.paper, 1));
    elements.push(textElement(`node-${node.id}-title`, node.title, node.box.x + 18, node.box.y + 15, node.box.width - 36, 28, 19, spec.theme.ink));
    if (node.description) elements.push(textElement(`node-${node.id}-description`, node.description, node.box.x + 18, node.box.y + 45, node.box.width - 36, node.box.height - 52, 12, spec.theme.mutedInk));
  }

  elements.forEach((element, index) => {
    element.index = `a${index.toString(36).padStart(5, "0")}`;
  });

  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "paper-system-atlas",
    elements,
    appState: {
      viewBackgroundColor: spec.theme.paper,
      gridSize: null,
      currentItemFontFamily: 5,
      zoom: { value: 1 },
    },
    files: {},
  }, null, 2);
}
