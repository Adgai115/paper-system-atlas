import type { AtlasNode, Box, LayoutEdge, Scene, RenderOptions } from "./types.js";
import { pointAlongPath } from "./motion.js";

const xml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function jitter(seed: string, amount: number, slot: number): number {
  const value = Math.sin((hash(seed) + slot * 9973) * 0.0001) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * amount * 2;
}

function roughRect(box: Box, seed: string, amount: number, radius = 18): string {
  const { x, y, width: w, height: h } = box;
  const r = Math.max(4, Math.min(radius, w / 4, h / 4));
  const j = (slot: number) => jitter(seed, amount, slot);
  return `M ${x + r + j(1)} ${y + j(2)} C ${x + w * 0.34} ${y + j(3)} ${x + w * 0.68} ${y + j(4)} ${x + w - r + j(5)} ${y + j(6)} Q ${x + w + j(7)} ${y + j(8)} ${x + w + j(9)} ${y + r + j(10)} C ${x + w + j(11)} ${y + h * 0.35} ${x + w + j(12)} ${y + h * 0.68} ${x + w + j(13)} ${y + h - r + j(14)} Q ${x + w + j(15)} ${y + h + j(16)} ${x + w - r + j(17)} ${y + h + j(18)} C ${x + w * 0.68} ${y + h + j(19)} ${x + w * 0.34} ${y + h + j(20)} ${x + r + j(21)} ${y + h + j(22)} Q ${x + j(23)} ${y + h + j(24)} ${x + j(25)} ${y + h - r + j(26)} C ${x + j(27)} ${y + h * 0.68} ${x + j(28)} ${y + h * 0.34} ${x + j(29)} ${y + r + j(30)} Q ${x + j(31)} ${y + j(32)} ${x + r + j(1)} ${y + j(2)} Z`;
}

function textUnits(value: string): number {
  return [...value].reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : 0.56), 0);
}

function wrapText(text: string, maxUnits: number, maxLines = 3): string[] {
  const source = String(text ?? "").trim();
  if (!source) return [];
  const tokens = /[\u3400-\u9fff]/.test(source) ? [...source] : source.split(/\s+/);
  const separator = /[\u3400-\u9fff]/.test(source) ? "" : " ";
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const next = line ? `${line}${separator}${token}` : token;
    if (line && textUnits(next) > maxUnits) {
      lines.push(line);
      line = token;
      if (lines.length === maxLines - 1) break;
    } else line = next;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const reconstructed = lines.join(separator);
  if (reconstructed.length < source.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[，。；、,.…]+$/, "")}…`;
  return lines;
}

function textLines(lines: string[], x: number, y: number, lineHeight: number, attrs: string): string {
  return `<text x="${x}" y="${y}" ${attrs}>${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`).join("")}</text>`;
}

function icon(node: AtlasNode, x: number, y: number, color: string, ink: string): string {
  const common = `fill="none" stroke="${ink}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"`;
  const kind = node.icon ?? "document";
  const shapes: Record<string, string> = {
    chat: `<path d="M3 5h34v23H17l-9 7v-7H3z"/><path d="M10 13h20M10 20h14"/>`,
    calendar: `<rect x="4" y="7" width="33" height="30" rx="4"/><path d="M4 15h33M12 3v8M29 3v8M11 22h3M20 22h3M29 22h3M11 29h3M20 29h3"/>`,
    voice: `<rect x="14" y="3" width="14" height="25" rx="7"/><path d="M8 21c0 9 26 9 26 0M21 31v7M14 38h14"/>`,
    document: `<path d="M8 3h20l8 8v27H8zM28 3v9h8M14 20h16M14 27h16"/>`,
    target: `<circle cx="21" cy="21" r="17"/><circle cx="21" cy="21" r="9"/><circle cx="21" cy="21" r="2"/><path d="M21 0v7M21 35v7M0 21h7M35 21h7"/>`,
    plan: `<rect x="3" y="5" width="13" height="10" rx="2"/><rect x="26" y="5" width="13" height="10" rx="2"/><rect x="14" y="27" width="14" height="10" rx="2"/><path d="M21 15v7M10 22h22M10 22v5M32 22v5"/>`,
    route: `<path d="M3 10h25M22 4l6 6-6 6M39 31H14M20 25l-6 6 6 6"/>`,
    shield: `<path d="M21 3l16 6v11c0 10-6 16-16 20C11 36 5 30 5 20V9z"/><path d="M13 21l6 6 11-13"/>`,
    browser: `<circle cx="21" cy="21" r="18"/><path d="M3 21h36M21 3c6 6 8 12 8 18s-2 12-8 18M21 3c-6 6-8 12-8 18s2 12 8 18"/>`,
    knowledge: `<path d="M3 7c8-3 14-1 18 4v27c-4-5-10-7-18-4zM39 7c-8-3-14-1-18 4v27c4-5 10-7 18-4z"/>`,
    code: `<path d="M14 9L3 21l11 12M28 9l11 12-11 12M24 5l-6 32"/>`,
    media: `<rect x="3" y="6" width="36" height="29" rx="3"/><circle cx="13" cy="15" r="3"/><path d="M6 31l10-10 7 7 5-5 8 8"/>`,
    report: `<path d="M8 3h20l8 8v27H8zM28 3v9h8M14 19h16M14 25h16M14 31h10"/>`,
    message: `<path d="M3 5h36v25H18l-10 8v-8H3zM11 15h20M11 22h14"/>`,
    dashboard: `<rect x="3" y="4" width="36" height="34" rx="3"/><path d="M10 31V21h5v10M19 31V13h5v18M28 31V17h5v14M8 31h27"/>`,
    archive: `<path d="M4 9h34v29H4zM2 4h38v8H2zM15 18h12"/>`,
    memory: `<ellipse cx="21" cy="8" rx="16" ry="5"/><path d="M5 8v25c0 3 7 6 16 6s16-3 16-6V8M5 20c0 3 7 6 16 6s16-3 16-6"/>`,
  };
  return `<g transform="translate(${x} ${y})"><path d="M-5 7 C3 -3 33 -5 45 7 C49 17 45 38 32 45 C17 48 -2 41 -7 27 C-9 19 -8 12 -5 7 Z" fill="${color}" opacity="0.2"/><path d="M-3 5 C8 -1 33 0 43 9 C47 21 42 37 31 43" fill="none" stroke="${color}" stroke-width="1.1" opacity="0.58"/> <g ${common}>${shapes[kind] ?? shapes.document}</g></g>`;
}

function smoothPath(edge: LayoutEdge): string {
  const points = edge.path;
  if (points.length < 2) return "";
  let result = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const inLength = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    const outLength = Math.hypot(next[0] - current[0], next[1] - current[1]);
    const radius = Math.min(42, inLength * 0.34, outLength * 0.34);
    const entry: [number, number] = [current[0] + (previous[0] - current[0]) * radius / Math.max(1, inLength), current[1] + (previous[1] - current[1]) * radius / Math.max(1, inLength)];
    const exit: [number, number] = [current[0] + (next[0] - current[0]) * radius / Math.max(1, outLength), current[1] + (next[1] - current[1]) * radius / Math.max(1, outLength)];
    result += ` L ${entry[0]} ${entry[1]} Q ${current[0]} ${current[1]} ${exit[0]} ${exit[1]}`;
  }
  const last = points[points.length - 1];
  return `${result} L ${last[0]} ${last[1]}`;
}

function organicPath(edge: LayoutEdge): string {
  const points = edge.path;
  if (points.length < 3) return smoothPath(edge);
  let result = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    result += ` C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
  }
  return result;
}

function showcaseDecorations(scene: Scene, hand: number): string {
  const { spec } = scene;
  const { width, height } = spec.canvas;
  const theme = spec.theme;
  const sx = width / 1674;
  const sy = height / 941;
  const decorations = spec.decorations;
  const callout = (x: number, y: number, lines: string[], color: string, rotation = 0): string => `<g transform="translate(${x * sx} ${y * sy}) rotate(${rotation})">${textLines(lines, 0, 0, 20 * sy, `fill="${color}" font-family="${xml(theme.titleFont)}" font-size="${15 * sy}" font-style="italic"`)}<path d="M0 ${12 * sy} C${38 * sx} ${4 * sy} ${75 * sx} ${17 * sy} ${116 * sx} ${8 * sy}" fill="none" stroke="${color}" stroke-width="1.6" opacity="0.78"/></g>`;
  const support = decorations?.support ?? { title: "系统支撑", description: spec.meta.description ?? spec.meta.subtitle ?? "共享能力与运行上下文" };
  const supportLines = wrapText(support.description ?? "", 12, 2);
  const memory = `<g id="showcase-memory"><path d="M${568 * sx} ${768 * sy} C${568 * sx} ${751 * sy} ${732 * sx} ${751 * sy} ${732 * sx} ${768 * sy} V${844 * sy} C${732 * sx} ${865 * sy} ${568 * sx} ${865 * sy} ${568 * sx} ${844 * sy} Z" fill="${theme.paper}" fill-opacity="0.84" stroke="${theme.ink}" stroke-width="1.5"/><ellipse cx="${650 * sx}" cy="${768 * sy}" rx="${82 * sx}" ry="${17 * sy}" fill="${theme.palette[1]}" fill-opacity="0.08" stroke="${theme.ink}" stroke-width="1.5"/><ellipse cx="${650 * sx}" cy="${771 * sy}" rx="${78 * sx}" ry="${13 * sy}" fill="none" stroke="${theme.palette[1]}" stroke-width="1" opacity="0.58"/><path d="M${574 * sx} ${842 * sy} C${604 * sx} ${856 * sy} ${695 * sx} ${858 * sy} ${726 * sx} ${842 * sy}" fill="none" stroke="${theme.palette[1]}" stroke-width="1.2" opacity="0.62"/><text x="${650 * sx}" y="${805 * sy}" text-anchor="middle" fill="${theme.ink}" font-family="${xml(theme.titleFont)}" font-size="${18 * sy}" font-weight="700">${xml(support.title)}</text>${textLines(supportLines, 650 * sx, 829 * sy, 18 * sy, `text-anchor="middle" fill="${theme.ink}" opacity="0.82" font-family="${xml(theme.bodyFont)}" font-size="${13 * sy}"`)}${[606, 650, 694].map((x) => `<path d="M${x * sx} ${716 * sy} V${755 * sy}" fill="none" stroke="${theme.palette[1]}" stroke-width="1.8" stroke-dasharray="4 5"/><path d="M${(x - 5) * sx} ${747 * sy} L${x * sx} ${756 * sy} L${(x + 5) * sx} ${747 * sy}" fill="none" stroke="${theme.palette[1]}" stroke-width="1.5"/>`).join("")}</g>`;
  const defaultLegend = [
    { kind: "signal" as const, label: "信号流" }, { kind: "task" as const, label: "任务流" },
    { kind: "result" as const, label: "结果流" }, { kind: "feedback" as const, label: "反馈回路" },
    { kind: "port" as const, label: "端口／接口" }, { kind: "storage" as const, label: support.title },
  ];
  const legendColors: Record<string, string> = { signal: theme.palette[0], task: theme.palette[1], result: theme.palette[4] ?? theme.palette[3], feedback: theme.palette[2], port: theme.ink, storage: theme.ink };
  const legendEntries = (decorations?.legend ?? defaultLegend).map((entry) => [legendColors[entry.kind], entry.label, entry.kind === "feedback" ? "dotted" : entry.kind] as const);
  const legend = `<g id="showcase-legend"><path d="${roughRect({ x: 34 * sx, y: 700 * sy, width: 205 * sx, height: 190 * sy }, "showcase-legend", hand * 0.5, 4)}" fill="${theme.paper}" fill-opacity="0.6" stroke="${theme.ink}" stroke-width="0.9"/><text x="${65 * sx}" y="${730 * sy}" fill="${theme.ink}" font-family="${xml(theme.titleFont)}" font-size="${17 * sy}">图例</text>${legendEntries.map(([color, label, kind], index) => {
    const y = (752 + index * 20) * sy;
    const mark = kind === "port" ? `<circle cx="${70 * sx}" cy="${(748 + index * 20) * sy}" r="${6 * sy}" fill="${theme.paper}" stroke="${color}" stroke-width="1.6"/>` : kind === "storage" ? `<ellipse cx="${70 * sx}" cy="${(744 + index * 20) * sy}" rx="${9 * sx}" ry="${4 * sy}" fill="none" stroke="${color}"/><path d="M${61 * sx} ${(744 + index * 20) * sy}v${10 * sy}c0 ${4 * sy} ${18 * sx} ${4 * sy} ${18 * sx} 0v-${10 * sy}" fill="none" stroke="${color}"/>` : `<path d="M${54 * sx} ${y} C${68 * sx} ${(y / sy - 3) * sy} ${82 * sx} ${(y / sy + 3) * sy} ${94 * sx} ${y}" fill="none" stroke="${color}" stroke-width="2.3"${kind === "dotted" ? ` stroke-dasharray="2 5"` : ""}/>`;
    return `${mark}<text x="${108 * sx}" y="${(757 + index * 20) * sy}" fill="${theme.ink}" font-family="${xml(theme.bodyFont)}" font-size="${12.5 * sy}">${label}</text>`;
  }).join("")}</g>`;
  const compass = decorations?.compass === false ? "" : `<g id="showcase-compass" transform="translate(${1580 * sx} ${801 * sy})" fill="none" stroke="${theme.ink}" opacity="0.68"><circle r="${43 * sy}"/><circle r="${31 * sy}" stroke-width="0.7"/><path d="M0 ${-50 * sy}V${50 * sy}M${-50 * sx} 0H${50 * sx}" stroke-width="0.8"/><path d="M0 ${-39 * sy} L${9 * sx} ${-6 * sy} L0 0 L${-9 * sx} ${-6 * sy} Z M0 ${39 * sy} L${-8 * sx} ${7 * sy} L0 0 L${8 * sx} ${7 * sy} Z M${-39 * sx} 0 L${-7 * sx} ${-8 * sy} L0 0 L${-7 * sx} ${8 * sy} Z M${39 * sx} 0 L${7 * sx} ${8 * sy} L0 0 L${7 * sx} ${-8 * sy} Z" fill="${theme.ink}" fill-opacity="0.2"/><text x="0" y="${-57 * sy}" text-anchor="middle" fill="${theme.ink}" font-family="serif" font-size="${13 * sy}">N</text><text x="0" y="${67 * sy}" text-anchor="middle" fill="${theme.ink}" font-family="serif" font-size="${13 * sy}">S</text><text x="${58 * sx}" y="${5 * sy}" fill="${theme.ink}" font-family="serif" font-size="${13 * sy}">E</text><text x="${-68 * sx}" y="${5 * sy}" fill="${theme.ink}" font-family="serif" font-size="${13 * sy}">W</text></g>`;
  const landscape = decorations?.landscape === false ? "" : `<g id="showcase-landscape" transform="translate(${1135 * sx} ${805 * sy})" fill="none" stroke="${theme.ink}" opacity="0.34" stroke-linecap="round"><path d="M0 48 C25 36 39 7 58 31 C73 -7 96 28 112 9 C124 31 145 15 163 42 C180 56 196 50 214 59"/><path d="M15 53 C43 44 58 56 85 49 C111 43 128 60 154 50 M61 31 l12 13 l12 -19 l18 22 M106 22 l12 18 l13 -12 l19 24"/><path d="M100 61 C86 72 78 82 91 91 C106 99 118 109 101 121" stroke-width="1.2"/></g>`;
  const calloutPositions = [[365, 246, -3], [390, 727, -2], [898, 765, -1], [1244, 690, -2]] as const;
  const authoredCallouts = decorations?.callouts ?? scene.groups.filter((group) => group.note).map((group) => ({ group: group.id, text: group.note!, color: group.color }));
  const callouts = authoredCallouts.slice(0, 4).map((item, index) => {
    const groupIndex = Math.max(0, scene.groups.findIndex((group) => group.id === item.group));
    const [x, y, rotation] = calloutPositions[groupIndex] ?? calloutPositions[index];
    const color = item.color ?? scene.groups[groupIndex]?.color ?? theme.ink;
    return callout(x, y, wrapText(item.text, 10, 3), color, rotation);
  }).join("");
  return `${memory}${legend}${callouts}${landscape}${compass}`;
}

export function renderSvg(scene: Scene, options: RenderOptions = {}): string {
  const { spec } = scene;
  const { width, height } = spec.canvas;
  const theme = spec.theme;
  const hand = Math.max(0.2, theme.handDrawn) * 3.5;
  const paperNoiseFilter = options.rasterOptimized
    ? `<filter id="paperNoise" x="-4%" y="-4%" width="108%" height="108%"><feTurbulence type="fractalNoise" baseFrequency="0.026 0.16" numOctaves="1" seed="13" result="grain"/><feColorMatrix in="grain" values="0 0 0 0 0.43 0 0 0 0 0.34 0 0 0 0 0.22 0 0 0 ${0.08 * theme.texture} 0"/></filter>`
    : `<filter id="paperNoise" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.18" numOctaves="3" seed="13" result="grain"/><feColorMatrix in="grain" values="0 0 0 0 0.43 0 0 0 0 0.34 0 0 0 0 0.22 0 0 0 ${0.11 * theme.texture} 0"/></filter>`;
  const watercolorFilter = options.rasterOptimized
    ? `<filter id="watercolor" x="-18%" y="-18%" width="136%" height="136%"><feGaussianBlur stdDeviation="4.8"/></filter>`
    : `<filter id="watercolor" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="29" result="washNoise"/><feDisplacementMap in="SourceGraphic" in2="washNoise" scale="13" xChannelSelector="R" yChannelSelector="B" result="warped"/><feGaussianBlur in="warped" stdDeviation="5.5"/></filter>`;
  const defs = `<defs>
    ${paperNoiseFilter}
    ${watercolorFilter}
    <filter id="softWash" x="-18%" y="-28%" width="136%" height="156%"><feGaussianBlur stdDeviation="4.5"/></filter>
    <pattern id="paperFibers" width="180" height="96" patternUnits="userSpaceOnUse"><path d="M-12 18 C38 11 95 25 192 16 M-20 62 C54 71 112 53 198 64 M24 -8 C20 24 31 58 27 106 M137 -6 C143 34 130 69 141 104" fill="none" stroke="#7C684A" stroke-width="0.55" opacity="${(0.075 * theme.texture).toFixed(3)}"/><circle cx="72" cy="43" r="0.8" fill="#6F5B3F" opacity="${(0.16 * theme.texture).toFixed(3)}"/></pattern>
    <radialGradient id="paperStainA"><stop offset="0" stop-color="#C99762" stop-opacity="0.08"/><stop offset="1" stop-color="#C99762" stop-opacity="0"/></radialGradient>
    <radialGradient id="paperStainB"><stop offset="0" stop-color="#91A8A1" stop-opacity="0.07"/><stop offset="1" stop-color="#91A8A1" stop-opacity="0"/></radialGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker>
  </defs>`;

  const background = `<rect width="${width}" height="${height}" fill="${theme.paper}"/><ellipse cx="${width * 0.18}" cy="${height * 0.27}" rx="${width * 0.3}" ry="${height * 0.35}" fill="url(#paperStainA)"/><ellipse cx="${width * 0.76}" cy="${height * 0.58}" rx="${width * 0.38}" ry="${height * 0.42}" fill="url(#paperStainB)"/><rect width="${width}" height="${height}" filter="url(#paperNoise)" opacity="0.9"/><rect width="${width}" height="${height}" fill="url(#paperFibers)"/><g fill="none" stroke="#806B4B" opacity="0.075"><path d="M38 150 C310 142 615 161 895 149 S1338 146 1563 154"/><path d="M47 ${height - 54} C350 ${height - 61} 694 ${height - 47} 1012 ${height - 57} S1395 ${height - 49} 1550 ${height - 58}"/></g>`;
  const showcaseTitle = spec.layout.profile === "atlas-showcase" && spec.layout.mode === "layered";
  const titleSize = showcaseTitle ? 72 : Math.max(52, Math.min(68, width * 0.043));
  const titleX = showcaseTitle ? 80 : 64;
  const titleY = showcaseTitle ? 108 : 76;
  const subtitleY = showcaseTitle ? 158 : 119;
  const title = `<g transform="rotate(${jitter(spec.meta.title, 0.32, 6).toFixed(2)} ${titleX} ${titleY})"><text x="${titleX}" y="${titleY}" fill="${theme.ink}" font-family="${xml(theme.titleFont)}" font-size="${titleSize}" font-weight="700" letter-spacing="3">${xml(spec.meta.title)}</text>${spec.meta.subtitle ? `<text x="${titleX + 4}" y="${subtitleY}" fill="${theme.ink}" opacity="0.82" font-family="${xml(theme.bodyFont)}" font-size="${showcaseTitle ? 24 : 23}" letter-spacing="2">${xml(spec.meta.subtitle)}</text>` : ""}${showcaseTitle ? "" : `<path d="M64 133 C168 127 286 140 407 131" stroke="${theme.palette[0]}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.72"/><path d="M82 137 C174 132 282 141 367 135" stroke="${theme.ink}" stroke-width="0.75" fill="none" opacity="0.3"/>`}</g>`;

  const edgeSvg = scene.edges.map((edge, index) => {
    const showcase = spec.layout.profile === "atlas-showcase" && spec.layout.mode === "layered";
    const renderPath = showcase ? organicPath : smoothPath;
    const path = renderPath(edge);
    const start = edge.path[0];
    const end = edge.path[edge.path.length - 1];
    const ports = `<circle cx="${start[0]}" cy="${start[1]}" r="7" fill="${theme.paper}" stroke="${theme.ink}" stroke-width="1.7"/><circle cx="${start[0]}" cy="${start[1]}" r="4.5" fill="none" stroke="${edge.color}" stroke-width="1.4"/><circle cx="${end[0]}" cy="${end[1]}" r="6" fill="${theme.paper}" stroke="${theme.ink}" stroke-width="1.55"/>`;
    const dash = edge.kind === "feedback" ? ` stroke-dasharray="4 6"` : "";
    const leftHub: [number, number] = [width * (485 / 1674), height * (459 / 941)];
    const rightHub: [number, number] = [width * (1315 / 1674), height * (443 / 941)];
    const hubIndex = showcase ? edge.path.findIndex((point) => (Math.hypot(point[0] - leftHub[0], point[1] - leftHub[1]) < 2) || (Math.hypot(point[0] - rightHub[0], point[1] - rightHub[1]) < 2)) : -1;
    let base: string;
    if (hubIndex > 0 && hubIndex < edge.path.length - 1) {
      const firstPath = renderPath({ ...edge, path: edge.path.slice(0, hubIndex + 1) });
      const secondPath = renderPath({ ...edge, path: edge.path.slice(hubIndex) });
      const isLeftHub = Math.abs(edge.path[hubIndex][0] - leftHub[0]) < 2;
      const deliveryIndex = scene.nodes.filter((node) => scene.groups.find((group) => group.id === node.group)?.index === 3).findIndex((node) => node.id === edge.to);
      const firstColor = isLeftHub ? theme.palette[0] : edge.color;
      const secondColor = isLeftHub ? theme.palette[1] : (deliveryIndex < 2 ? theme.palette[0] : theme.palette[3]);
      base = `<path id="edge-${index}" d="${path}" fill="none" stroke="${edge.color}" stroke-width="7" stroke-opacity="0.07" stroke-linecap="round"/><path d="${firstPath}" transform="translate(1.2 -1)" fill="none" stroke="${firstColor}" stroke-width="1.1" stroke-opacity="0.4"/><path d="${firstPath}" fill="none" stroke="${firstColor}" stroke-width="2.25" stroke-opacity="0.88" stroke-linecap="round" stroke-linejoin="round"/><path d="${secondPath}" transform="translate(1.2 -1)" fill="none" stroke="${secondColor}" stroke-width="1.1" stroke-opacity="0.4"/><path d="${secondPath}" fill="none" stroke="${secondColor}" stroke-width="2.25" stroke-opacity="0.88" marker-end="url(#arrow)" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      base = `<path id="edge-${index}" d="${path}" fill="none" stroke="${edge.color}" stroke-width="7" stroke-opacity="0.07" stroke-linecap="round"/><path d="${path}" transform="translate(1.3 -1.1)" fill="none" stroke="${edge.color}" stroke-width="1.15" stroke-opacity="0.42" stroke-linecap="round"/><path d="${path}" fill="none" stroke="${edge.color}" stroke-width="2.2" stroke-opacity="0.86" marker-end="url(#arrow)" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    }
    const accent = `<path d="${path}" fill="none" stroke="${edge.color}" stroke-width="0.9" stroke-dasharray="1 9" stroke-dashoffset="4" stroke-opacity="0.82"/>${ports}`;
    if (!edge.animated) return base + accent;
    if (options.animatedSvg) {
      const begin = (index % 7) * -0.37;
      const signal = [
        { radius: 2.1, opacity: 0.2, lag: 0.2 },
        { radius: 2.7, opacity: 0.32, lag: 0.13 },
        { radius: 3.2, opacity: 0.46, lag: 0.065 },
        { radius: 8.5, opacity: 0.15, lag: 0 },
        { radius: 4.1, opacity: 0.96, lag: 0 },
      ].map((dot) => `<circle r="${dot.radius}" fill="${edge.color}" opacity="${dot.opacity}"><animateMotion dur="3.2s" begin="${begin - dot.lag}s" repeatCount="indefinite" path="${path}"/></circle>`).join("");
      return `${base}${accent}<g class="atlas-signal" aria-label="${xml(edge.from)} 到 ${xml(edge.to)} 的动态信号">${signal}</g>`;
    }
    if (options.frameProgress !== undefined) {
      const phase = (options.frameProgress + index * 0.113) % 1;
      const trail = [0.065, 0.042, 0.021].map((lag, trailIndex) => {
        const point = pointAlongPath(edge, (phase - lag + 1) % 1);
        return `<circle cx="${point[0]}" cy="${point[1]}" r="${2.1 + trailIndex * 0.5}" fill="${edge.color}" opacity="${0.2 + trailIndex * 0.13}"/>`;
      }).join("");
      const point = pointAlongPath(edge, phase);
      return `${base}${accent}${trail}<circle cx="${point[0]}" cy="${point[1]}" r="9" fill="${edge.color}" opacity="0.16"/><circle cx="${point[0]}" cy="${point[1]}" r="4.1" fill="${edge.color}"/>`;
    }
    return base + accent;
  }).join("");

  const edgeLabels = scene.edges.filter((edge) => edge.label?.trim()).map((edge) => {
    const label = edge.label!.trim();
    const [x, y] = pointAlongPath(edge, 0.52);
    const lines = wrapText(label, 12, 2);
    const widest = Math.max(...lines.map(textUnits));
    const box: Box = {
      x: x - Math.max(42, widest * 6.4 + 13),
      y: y - (lines.length * 15 + 12) / 2,
      width: Math.max(84, widest * 12.8 + 26),
      height: lines.length * 15 + 12,
    };
    return `<g id="edge-label-${xml(edge.from)}-${xml(edge.to)}"><path d="${roughRect(box, `edge-label-${edge.from}-${edge.to}`, hand * 0.42, 8)}" fill="${theme.paper}" fill-opacity="0.94" stroke="${edge.color}" stroke-width="0.9" opacity="0.96"/>${textLines(lines, box.x + box.width / 2, box.y + 17, 15, `text-anchor="middle" fill="${theme.ink}" font-family="${xml(theme.bodyFont)}" font-size="12"`)}</g>`;
  }).join("");

  const junctions = new Map<string, { point: [number, number]; color: string; count: number }>();
  for (const edge of scene.edges) {
    for (const point of edge.path.slice(1, -1)) {
      const key = `${Math.round(point[0] * 10) / 10}:${Math.round(point[1] * 10) / 10}`;
      const current = junctions.get(key);
      if (current) current.count += 1;
      else junctions.set(key, { point, color: edge.color, count: 1 });
    }
  }
  const junctionSvg = `<g id="atlas-junctions">${[...junctions.values()].filter((junction) => junction.count >= 3).map((junction) => `<g><circle cx="${junction.point[0]}" cy="${junction.point[1]}" r="13" fill="${theme.paper}" fill-opacity="0.88" stroke="${theme.ink}" stroke-width="1.8"/><circle cx="${junction.point[0]}" cy="${junction.point[1]}" r="9" fill="none" stroke="${junction.color}" stroke-width="2.4"/><circle cx="${junction.point[0]}" cy="${junction.point[1]}" r="3.4" fill="${junction.color}"/><circle cx="${junction.point[0] + 1.4}" cy="${junction.point[1] - 1.2}" r="15.8" fill="none" stroke="${junction.color}" stroke-width="0.75" opacity="0.38"/></g>`).join("")}</g>`;

  const groups = scene.groups.map((group) => {
    const b = group.box;
    const lane = spec.layout.mode === "lanes" || spec.layout.direction === "vertical";
    const floating = spec.layout.mode === "layered" && spec.layout.direction === "horizontal";
    const outline = floating ? { x: b.x, y: b.y + 48, width: b.width, height: b.height - 48 } : b;
    const wash = { x: outline.x - 5, y: outline.y - 5, width: outline.width + 10, height: outline.height + 10 };
    const groupTitleSize = Math.max(19, Math.min(27, (b.width - 84) / Math.max(2.5, textUnits(group.title))));
    const noteX = floating ? b.x + 54 : lane ? b.x + Math.min(230, b.width * 0.25) : b.x + 22;
    const noteY = floating ? b.y + 57 : lane ? b.y + 36 : b.y + 62;
    const showGroupNote = group.note && !(spec.layout.profile === "atlas-showcase" && spec.layout.mode === "layered");
    return `<g id="group-${xml(group.id)}"><path d="${roughRect(wash, `${group.id}-wash-a`, hand * 2.7, 32)}" fill="${group.color}" opacity="0.13" filter="url(#watercolor)"/><path d="${roughRect({ x: wash.x + 8, y: wash.y + 5, width: wash.width - 13, height: wash.height - 9 }, `${group.id}-wash-b`, hand * 3.1, 38)}" fill="${group.color}" opacity="0.055" filter="url(#softWash)"/><path d="${roughRect(outline, group.id, hand * 1.14, 28)}" fill="${group.color}" fill-opacity="0.025" stroke="${group.color}" stroke-width="1.65" stroke-dasharray="8 5"/><path d="${roughRect({ x: outline.x + 4, y: outline.y + 2, width: outline.width - 8, height: outline.height - 5 }, `${group.id}-echo`, hand * 0.86, 30)}" fill="none" stroke="${group.color}" stroke-width="0.75" opacity="0.36"/><circle cx="${b.x + 25}" cy="${b.y + 27}" r="18" fill="${theme.paper}" fill-opacity="0.86" stroke="${group.color}" stroke-width="2"/><circle cx="${b.x + 26.2}" cy="${b.y + 26.2}" r="21" fill="none" stroke="${group.color}" stroke-width="0.7" opacity="0.42"/><text x="${b.x + 25}" y="${b.y + 34}" text-anchor="middle" fill="${group.color}" font-family="${xml(theme.titleFont)}" font-size="22" font-weight="700">${group.index + 1}</text><text x="${b.x + 54}" y="${b.y + 36}" fill="${group.color}" font-family="${xml(theme.titleFont)}" font-size="${groupTitleSize}" font-weight="700" letter-spacing="1.5">${xml(group.title)}</text>${showGroupNote ? `<text x="${noteX}" y="${noteY}" fill="${theme.mutedInk}" font-family="${xml(theme.bodyFont)}" font-size="12.5">${xml(group.note!)}</text>` : ""}</g>`;
  }).join("");

  const hubSvg = scene.hub ? (() => {
    const hub = scene.hub!;
    const b = hub.box;
    const titleLines = wrapText(hub.title, 12, 2);
    const descriptionLines = wrapText(hub.description ?? "", 20, 2);
    return `<g id="atlas-radial-hub"><path d="${roughRect({ x: b.x - 10, y: b.y - 9, width: b.width + 20, height: b.height + 18 }, "radial-hub-wash", hand * 1.7, 32)}" fill="${hub.color}" opacity="0.15" filter="url(#softWash)"/><path d="${roughRect(b, "radial-hub", hand * 0.9, 24)}" fill="${theme.paper}" fill-opacity="0.96" stroke="${hub.color}" stroke-width="2.2"/><path d="${roughRect({ x: b.x + 5, y: b.y + 5, width: b.width - 10, height: b.height - 10 }, "radial-hub-inner", hand * 0.5, 20)}" fill="${hub.color}" fill-opacity="0.055" stroke="${hub.color}" stroke-width="0.8" opacity="0.68"/>${textLines(titleLines, b.x + b.width / 2, b.y + 39, 25, `text-anchor="middle" fill="${theme.ink}" font-family="${xml(theme.titleFont)}" font-size="23" font-weight="700"`)}${textLines(descriptionLines, b.x + b.width / 2, b.y + 78, 17, `text-anchor="middle" fill="${theme.mutedInk}" font-family="${xml(theme.bodyFont)}" font-size="12.5"`)}</g>`;
  })() : "";

  const nodes = scene.nodes.map((node) => {
    const b = node.box;
    const group = scene.groups.find((item) => item.id === node.group)!;
    const groupNodeIndex = scene.nodes.filter((item) => item.group === node.group).findIndex((item) => item.id === node.id);
    const specialistColors = [theme.palette[2], theme.palette[4] ?? theme.palette[2], theme.palette[2], theme.palette[3] ?? theme.palette[2]];
    const color = node.color ?? (spec.layout.mode === "layered" && group.index === 2 ? specialistColors[groupNodeIndex % specialistColors.length] : group.color);
    const titleArea = Math.max(54, b.width - 88);
    const titleSize = Math.max(15, Math.min(b.width < 220 ? 18 : 20, titleArea / Math.max(2.4, textUnits(node.title))));
    const descriptionSize = b.width < 220 ? 11.5 : 13;
    const titleX = b.x + 70;
    const titleLines = wrapText(node.title, Math.max(3, titleArea / Math.max(14, titleSize)), 2);
    const titleY = b.y + Math.min(32, b.height * 0.32);
    const descriptionY = titleY + titleLines.length * (titleSize + 1) + 4;
    const availableDescription = b.y + b.height - descriptionY - 8;
    const maxDescriptionLines = Math.max(0, Math.min(3, Math.floor(availableDescription / 16) + 1));
    const desc = wrapText(node.description ?? "", Math.max(7, (b.width - 86) / (descriptionSize * 0.86)), maxDescriptionLines);
    const angle = jitter(node.id, 0.52, 90).toFixed(3);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const washBox = { x: b.x - 5, y: b.y - 4, width: b.width + 10, height: b.height + 8 };
    return `<g id="node-${xml(node.id)}" transform="rotate(${angle} ${cx} ${cy})"><path d="${roughRect(washBox, `${node.id}-wash-a`, hand * 1.9, 22)}" fill="${color}" opacity="0.16" filter="url(#softWash)"/><path d="${roughRect({ x: washBox.x + 5, y: washBox.y - 2, width: washBox.width - 8, height: washBox.height + 3 }, `${node.id}-wash-b`, hand * 2.35, 25)}" fill="${color}" opacity="0.075" filter="url(#softWash)"/><path d="${roughRect({ x: b.x + 2.5, y: b.y + 4, width: b.width, height: b.height }, `${node.id}-color-echo`, hand * 1.14, 18)}" fill="none" stroke="${color}" stroke-width="2.1" opacity="0.58"/><path d="${roughRect(b, node.id, hand * 1.08, 17)}" fill="${theme.paper}" fill-opacity="0.82" stroke="${theme.ink}" stroke-width="1.45"/><path d="${roughRect({ x: b.x + 3, y: b.y + 3, width: b.width - 6, height: b.height - 6 }, `${node.id}-inner`, hand * 0.72, 14)}" fill="${color}" fill-opacity="0.035" stroke="${color}" stroke-width="0.9" opacity="0.62"/>${icon(node, b.x + 16, b.y + Math.max(12, b.height / 2 - 21), color, theme.ink)}${textLines(titleLines, titleX, titleY, titleSize + 2, `fill="${theme.ink}" font-family="${xml(theme.titleFont)}" font-size="${titleSize}" font-weight="700" letter-spacing="0.6"`)}${textLines(desc, titleX, descriptionY, 16, `fill="${theme.ink}" opacity="0.82" font-family="${xml(theme.bodyFont)}" font-size="${descriptionSize}"`)}</g>`;
  }).join("");

  const nodePulses = options.animatedSvg ? `<g id="atlas-node-pulses" fill="none">${scene.nodes.map((node, nodeIndex) => {
    const incomingIndex = scene.edges.findIndex((edge) => edge.animated && edge.to === node.id);
    if (incomingIndex < 0) return "";
    const group = scene.groups.find((item) => item.id === node.group)!;
    const color = node.color ?? group.color;
    const pulseBox = { x: node.box.x - 6, y: node.box.y - 6, width: node.box.width + 12, height: node.box.height + 12 };
    return `<path d="${roughRect(pulseBox, `${node.id}-pulse`, hand * 0.75, 21)}" stroke="${color}" stroke-width="2.6" opacity="0"><animate attributeName="opacity" values="0;0;0.5;0" keyTimes="0;0.72;0.9;1" dur="3.2s" begin="${(incomingIndex % 7) * -0.37 + nodeIndex * -0.015}s" repeatCount="indefinite"/></path>`;
  }).join("")}</g>` : "";

  const notes = (spec.notes ?? []).map((note, index) => {
    const anchor = note.anchor ?? (index % 2 ? "bottom-right" : "bottom-left");
    const color = note.color ?? theme.mutedInk;
    if (anchor === "top-right") {
      const showcase = spec.layout.profile === "atlas-showcase" && spec.layout.mode === "layered";
      const box = showcase ? { x: width - 240, y: 44, width: 190, height: 164 } : { x: width - 220, y: 40, width: 170, height: 112 };
      const principles = showcase
        ? (spec.decorations?.principles ?? (spec.notes ?? []).flatMap((item) => item.text.split(/\s*·\s*/)))
        : (spec.notes ?? []).flatMap((item) => item.text.split(/\s*·\s*/)).map((item) => /SVG|Excalidraw/i.test(item) ? "可编辑矢量输出" : item);
      const lines = principles.flatMap((item) => wrapText(item, 10, 2)).slice(0, showcase ? 5 : 4);
      return `<g transform="rotate(${jitter(note.text, 0.8, 4).toFixed(2)} ${box.x + box.width / 2} ${box.y + box.height / 2})"><path d="${roughRect(box, `note-${index}`, hand * 0.65, 3)}" fill="${theme.paper}" fill-opacity="0.68" stroke="${theme.ink}" stroke-width="1" opacity="0.72"/><path d="M${box.x + box.width - 24} ${box.y} l24 24 h-24z" fill="none" stroke="${theme.ink}" stroke-width="0.8" opacity="0.6"/><text x="${box.x + 18}" y="${box.y + 27}" fill="${theme.ink}" font-family="${xml(theme.titleFont)}" font-size="17">${showcase ? "设计原则" : "设计注记"}</text>${textLines(lines.map((line) => `· ${line}`), box.x + 18, box.y + 51, 19, `fill="${color}" font-family="${xml(theme.bodyFont)}" font-size="13"`)}</g>`;
    }
    if (spec.layout.profile === "atlas-showcase" && spec.layout.mode === "layered") return "";
    const lines = wrapText(note.text, 16, 2);
    const x = spec.layout.mode === "layered" ? (anchor.endsWith("right") ? width - 330 : 58) : width * 0.42;
    const y = spec.layout.mode === "layered" ? height - 84 - index * 24 : height - (lines.length > 1 ? 68 : 48);
    return `<g transform="rotate(${jitter(note.text, 1.2, 7).toFixed(2)} ${x} ${y})">${textLines(lines, x, y, 19, `fill="${color}" font-family="${xml(theme.titleFont)}" font-size="15.5" font-style="italic"`)}<path d="M${x} ${y + 10} C${x + 42} ${y + 2} ${x + 92} ${y + 17} ${x + 142} ${y + 8}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.74"/></g>`;
  }).join("");

  const layeredDecorations = spec.layout.profile === "atlas-showcase" && spec.layout.mode === "layered" ? showcaseDecorations(scene, hand) : spec.layout.mode === "layered" && scene.groups.length === 4 ? `<g id="atlas-legend"><path d="${roughRect({ x: 30, y: height - 142, width: 190, height: 116 }, "legend", hand * 0.54, 4)}" fill="${theme.paper}" fill-opacity="0.52" stroke="${theme.ink}" stroke-width="0.9" opacity="0.82"/><text x="48" y="${height - 116}" fill="${theme.ink}" font-family="${xml(theme.titleFont)}" font-size="16">图例</text>${[
    [theme.palette[0], "用户信号流"], [theme.palette[1], "编排与反馈"], [theme.palette[2], "专家任务流"], [theme.palette[4] ?? theme.palette[3], "结果输出流"],
  ].map(([color, label], index) => `<path d="M48 ${height - 94 + index * 18} C65 ${height - 97 + index * 18} 76 ${height - 91 + index * 18} 91 ${height - 94 + index * 18}" stroke="${color}" stroke-width="2.4" fill="none"/><text x="103" y="${height - 89 + index * 18}" fill="${theme.ink}" font-family="${xml(theme.bodyFont)}" font-size="12">${label}</text>`).join("")}</g>${spec.meta.description ? `<g transform="rotate(-1.2 ${width * 0.4} ${height - 58})">${textLines(wrapText(spec.meta.description, 18, 2), width * 0.36, height - 75, 19, `fill="${theme.palette[1]}" font-family="${xml(theme.titleFont)}" font-size="15"`)}<path d="M${width * 0.43} ${height - 99} q18 -24 34 -7" fill="none" stroke="${theme.palette[1]}" stroke-width="1.4"/><path d="M${width * 0.452} ${height - 95} l-7 -10 l12 1" fill="none" stroke="${theme.palette[1]}" stroke-width="1.4"/></g>` : ""}` : "";

  const corners = `<g fill="none" stroke="${theme.ink}" opacity="0.22"><path d="M20 42V20h22M${width - 42} 20h22v22M20 ${height - 42}v22h22M${width - 42} ${height - 20}h22v-22"/><circle cx="20" cy="20" r="5"/><circle cx="${width - 20}" cy="20" r="5"/><circle cx="20" cy="${height - 20}" r="5"/><circle cx="${width - 20}" cy="${height - 20}" r="5"/></g>`;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}${background}${title}${groups}${edgeSvg}${edgeLabels}${hubSvg}${nodes}${nodePulses}${junctionSvg}${notes}${layeredDecorations}${corners}</svg>`;
}
