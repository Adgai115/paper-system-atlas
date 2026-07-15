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

function lineElement(id: string, points: [number, number][], color: string, strokeWidth = 1): Element {
  const minX = Math.min(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxX = Math.max(...points.map(([x]) => x));
  const maxY = Math.max(...points.map(([, y]) => y));
  const element = elementBase(id, "line", { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, color, "transparent", 1);
  element.points = points.map(([x, y]) => [x - minX, y - minY]);
  element.strokeWidth = strokeWidth;
  element.startBinding = null;
  element.endBinding = null;
  element.lastCommittedPoint = null;
  return element;
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
    const samples = edge.path;
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

  if (spec.layout.profile === "atlas-showcase" && spec.layout.mode === "layered") {
    const sx = spec.canvas.width / 1674;
    const sy = spec.canvas.height / 941;
    const scaled = (x: number, y: number, width: number, height: number): Box => ({ x: x * sx, y: y * sy, width: width * sx, height: height * sy });
    elements.push(elementBase("showcase-memory-body", "rectangle", scaled(568, 768, 164, 82), spec.theme.ink, spec.theme.paper, 1));
    elements.push(elementBase("showcase-memory-top", "ellipse", scaled(568, 751, 164, 34), spec.theme.palette[1], spec.theme.paper, 1));
    elements.push(textElement("showcase-memory-title", "记忆与上下文", 584 * sx, 790 * sy, 132 * sx, 26 * sy, 18, spec.theme.ink, "center"));
    elements.push(textElement("showcase-memory-copy", "历史、偏好、知识图谱", 582 * sx, 820 * sy, 136 * sx, 38 * sy, 12, spec.theme.mutedInk, "center"));
    for (const [index, x] of [606, 650, 694].entries()) elements.push(lineElement(`showcase-memory-link-${index}`, [[x * sx, 716 * sy], [x * sx, 755 * sy]], spec.theme.palette[1], 2));

    elements.push(elementBase("showcase-principles", "rectangle", scaled(1434, 44, 190, 164), spec.theme.ink, spec.theme.paper, 1));
    elements.push(textElement("showcase-principles-title", "设计原则", 1452 * sx, 61 * sy, 150 * sx, 25 * sy, 17, spec.theme.ink));
    elements.push(textElement("showcase-principles-copy", "· 以意图为先\n· 上下文丰富\n· 专家驱动\n· 可验证与安全\n· 人性回环中", 1452 * sx, 91 * sy, 150 * sx, 108 * sy, 13, spec.theme.palette[0]));

    elements.push(elementBase("showcase-legend", "rectangle", scaled(34, 700, 205, 190), spec.theme.ink, spec.theme.paper, 1));
    elements.push(textElement("showcase-legend-title", "图例", 65 * sx, 712 * sy, 80 * sx, 25 * sy, 17, spec.theme.ink));
    elements.push(textElement("showcase-legend-copy", "用户信号流\n编排流程\n专家任务流\n结果输出流\n上下文／反馈\n端口／接口\n存储／记忆", 108 * sx, 742 * sy, 112 * sx, 140 * sy, 12, spec.theme.ink));
    const callouts: Array<[string, string, number, number, string]> = [
      ["input", "捕捉一切，\n理解意图。", 365, 230, spec.theme.palette[0]],
      ["orchestration", "规划执行路径，\n路由时带上下文，\n验证结果。", 390, 710, spec.theme.palette[1]],
      ["specialists", "专家各司其职，\n并行、安全、可靠。", 898, 748, spec.theme.palette[2]],
      ["delivery", "以合适的形式，\n交付给合适的人，\n在正确的时间。", 1244, 674, spec.theme.palette[0]],
      ["adaptive", "自适应系统，\n持续学习，\n不断优化结果。", 1352, 812, spec.theme.ink],
    ];
    for (const [id, text, x, y, color] of callouts) elements.push(textElement(`showcase-callout-${id}`, text, x * sx, y * sy, 180 * sx, 75 * sy, 15, color));
    elements.push(elementBase("showcase-compass", "ellipse", scaled(1537, 758, 86, 86), spec.theme.ink, "transparent", 1));
    elements.push(textElement("showcase-compass-n", "N", 1570 * sx, 740 * sy, 20, 20, 13, spec.theme.ink, "center"));
    elements.push(textElement("showcase-compass-s", "S", 1570 * sx, 850 * sy, 20, 20, 13, spec.theme.ink, "center"));
    elements.push(textElement("showcase-compass-we", "W       E", 1512 * sx, 793 * sy, 140 * sx, 20, 13, spec.theme.ink, "center"));
    elements.push(lineElement("showcase-landscape", [[1135 * sx, 853 * sy], [1193 * sx, 814 * sy], [1247 * sx, 844 * sy], [1298 * sx, 814 * sy], [1349 * sx, 864 * sy]], spec.theme.ink, 1));
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
