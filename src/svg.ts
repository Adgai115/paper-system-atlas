import type { AtlasNode, Box, LayoutEdge, Scene, RenderOptions } from "./types.js";

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

function icon(node: AtlasNode, x: number, y: number, color: string): string {
  const common = `fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;
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
  return `<g transform="translate(${x} ${y})" ${common}>${shapes[kind] ?? shapes.document}</g>`;
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

function pathPoint(edge: LayoutEdge, t: number): [number, number] {
  const lengths = edge.path.slice(1).map((point, index) => Math.hypot(point[0] - edge.path[index][0], point[1] - edge.path[index][1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let distance = Math.max(0, Math.min(1, t)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (distance <= lengths[index] || index === lengths.length - 1) {
      const ratio = lengths[index] ? distance / lengths[index] : 0;
      const from = edge.path[index];
      const to = edge.path[index + 1];
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
    }
    distance -= lengths[index];
  }
  return edge.path[edge.path.length - 1];
}

export function renderSvg(scene: Scene, options: RenderOptions = {}): string {
  const { spec } = scene;
  const { width, height } = spec.canvas;
  const theme = spec.theme;
  const hand = Math.max(0.2, theme.handDrawn) * 3.5;
  const defs = `<defs>
    <filter id="paperNoise" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.013 0.42" numOctaves="4" seed="13" result="grain"/><feColorMatrix in="grain" values="0 0 0 0 0.43 0 0 0 0 0.34 0 0 0 0 0.22 0 0 0 ${0.16 * theme.texture} 0"/></filter>
    <filter id="watercolor" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="29" result="washNoise"/><feDisplacementMap in="SourceGraphic" in2="washNoise" scale="13" xChannelSelector="R" yChannelSelector="B" result="warped"/><feGaussianBlur in="warped" stdDeviation="5.5"/></filter>
    <filter id="softWash" x="-18%" y="-28%" width="136%" height="156%"><feGaussianBlur stdDeviation="4.5"/></filter>
    <pattern id="paperFibers" width="180" height="96" patternUnits="userSpaceOnUse"><path d="M-12 18 C38 11 95 25 192 16 M-20 62 C54 71 112 53 198 64 M24 -8 C20 24 31 58 27 106 M137 -6 C143 34 130 69 141 104" fill="none" stroke="#7C684A" stroke-width="0.55" opacity="${(0.055 * theme.texture).toFixed(3)}"/><circle cx="72" cy="43" r="0.8" fill="#6F5B3F" opacity="${(0.13 * theme.texture).toFixed(3)}"/></pattern>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker>
  </defs>`;

  const background = `<rect width="${width}" height="${height}" fill="${theme.paper}"/><rect width="${width}" height="${height}" filter="url(#paperNoise)" opacity="0.92"/><rect width="${width}" height="${height}" fill="url(#paperFibers)"/><g fill="none" stroke="#806B4B" opacity="0.08"><path d="M38 150 C310 142 615 161 895 149 S1338 146 1563 154"/><path d="M47 ${height - 54} C350 ${height - 61} 694 ${height - 47} 1012 ${height - 57} S1395 ${height - 49} 1550 ${height - 58}"/></g>`;
  const title = `<g><text x="64" y="68" fill="${theme.ink}" font-family="${xml(theme.titleFont)}" font-size="52" font-weight="700">${xml(spec.meta.title)}</text>${spec.meta.subtitle ? `<text x="66" y="108" fill="${theme.mutedInk}" font-family="${xml(theme.bodyFont)}" font-size="20">${xml(spec.meta.subtitle)}</text>` : ""}<path d="M64 124 C190 118 320 132 455 122" stroke="${theme.palette[0]}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8"/></g>`;

  const edgeSvg = scene.edges.map((edge, index) => {
    const path = smoothPath(edge);
    const start = edge.path[0];
    const end = edge.path[edge.path.length - 1];
    const ports = `<circle cx="${start[0]}" cy="${start[1]}" r="6.2" fill="${theme.paper}" stroke="${edge.color}" stroke-width="2"/><circle cx="${end[0]}" cy="${end[1]}" r="4.7" fill="${theme.paper}" stroke="${edge.color}" stroke-width="1.7"/>`;
    const base = `<path id="edge-${index}" d="${path}" fill="none" stroke="${edge.color}" stroke-width="4.8" stroke-opacity="0.09" stroke-linecap="round"/><path d="${path}" fill="none" stroke="${edge.color}" stroke-width="2.35" stroke-opacity="0.72" marker-end="url(#arrow)" stroke-linecap="round" stroke-linejoin="round"/>`;
    const accent = `<path d="${path}" fill="none" stroke="${edge.color}" stroke-width="0.95" stroke-dasharray="1 8" stroke-opacity="0.72"/>${ports}`;
    if (!edge.animated) return base + accent;
    if (options.animatedSvg) return `${base}${accent}<circle r="5" fill="${edge.color}"><animateMotion dur="3.2s" begin="${(index % 7) * -0.37}s" repeatCount="indefinite" path="${path}"/></circle>`;
    if (options.frameProgress !== undefined) {
      const point = pathPoint(edge, (options.frameProgress + index * 0.113) % 1);
      return `${base}${accent}<circle cx="${point[0]}" cy="${point[1]}" r="7" fill="${edge.color}" opacity="0.22"/><circle cx="${point[0]}" cy="${point[1]}" r="3.2" fill="${edge.color}"/>`;
    }
    return base + accent;
  }).join("");

  const groups = scene.groups.map((group) => {
    const b = group.box;
    const lane = spec.layout.mode === "lanes" || spec.layout.direction === "vertical";
    const wash = { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 };
    const groupTitleSize = Math.max(19, Math.min(27, (b.width - 84) / Math.max(2.5, textUnits(group.title))));
    return `<g id="group-${xml(group.id)}"><path d="${roughRect(wash, `${group.id}-wash-a`, hand * 2.4, 28)}" fill="${group.color}" opacity="0.105" filter="url(#watercolor)"/><path d="${roughRect({ x: wash.x + 7, y: wash.y + 5, width: wash.width - 11, height: wash.height - 8 }, `${group.id}-wash-b`, hand * 2.9, 34)}" fill="${group.color}" opacity="0.045" filter="url(#softWash)"/><path d="${roughRect(b, group.id, hand * 1.08, 26)}" fill="${group.color}" fill-opacity="0.035" stroke="${group.color}" stroke-width="1.8" stroke-dasharray="8 5"/><path d="${roughRect({ x: b.x + 3, y: b.y + 2, width: b.width - 6, height: b.height - 4 }, `${group.id}-echo`, hand * 0.72, 25)}" fill="none" stroke="${group.color}" stroke-width="0.65" opacity="0.28"/><circle cx="${b.x + 25}" cy="${b.y + 29}" r="18" fill="${theme.paper}" fill-opacity="0.78" stroke="${group.color}" stroke-width="2"/><circle cx="${b.x + 25.8}" cy="${b.y + 28.3}" r="20.5" fill="none" stroke="${group.color}" stroke-width="0.7" opacity="0.32"/><text x="${b.x + 25}" y="${b.y + 36}" text-anchor="middle" fill="${group.color}" font-family="${xml(theme.titleFont)}" font-size="22" font-weight="700">${group.index + 1}</text><text x="${b.x + 54}" y="${b.y + 38}" fill="${group.color}" font-family="${xml(theme.titleFont)}" font-size="${groupTitleSize}" font-weight="700">${xml(group.title)}</text>${group.note ? `<text x="${lane ? b.x + Math.min(230, b.width * 0.25) : b.x + 22}" y="${lane ? b.y + 36 : b.y + 62}" fill="${theme.mutedInk}" font-family="${xml(theme.bodyFont)}" font-size="12">${xml(group.note)}</text>` : ""}</g>`;
  }).join("");

  const nodes = scene.nodes.map((node) => {
    const b = node.box;
    const group = scene.groups.find((item) => item.id === node.group)!;
    const color = node.color ?? group.color;
    const titleArea = Math.max(54, b.width - 88);
    const titleSize = Math.max(14, Math.min(b.width < 220 ? 17 : 20, titleArea / Math.max(2.4, textUnits(node.title))));
    const descriptionSize = b.width < 220 ? 11 : 13;
    const titleX = b.x + 70;
    const titleLines = wrapText(node.title, Math.max(3, titleArea / Math.max(14, titleSize)), 2);
    const titleY = b.y + Math.min(32, b.height * 0.32);
    const descriptionY = titleY + titleLines.length * (titleSize + 1) + 4;
    const availableDescription = b.y + b.height - descriptionY - 8;
    const maxDescriptionLines = Math.max(0, Math.min(3, Math.floor(availableDescription / 16) + 1));
    const desc = wrapText(node.description ?? "", Math.max(7, (b.width - 86) / (descriptionSize * 0.86)), maxDescriptionLines);
    const angle = jitter(node.id, 0.34, 90).toFixed(3);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const washBox = { x: b.x - 5, y: b.y - 4, width: b.width + 10, height: b.height + 8 };
    return `<g id="node-${xml(node.id)}" transform="rotate(${angle} ${cx} ${cy})"><path d="${roughRect(washBox, `${node.id}-wash-a`, hand * 1.65, 22)}" fill="${color}" opacity="0.115" filter="url(#softWash)"/><path d="${roughRect({ x: washBox.x + 5, y: washBox.y - 1, width: washBox.width - 8, height: washBox.height + 2 }, `${node.id}-wash-b`, hand * 2.1, 25)}" fill="${color}" opacity="0.052" filter="url(#softWash)"/><path d="${roughRect(b, node.id, hand * 1.02, 17)}" fill="${theme.paper}" fill-opacity="0.76" stroke="${color}" stroke-width="2.15"/><path d="${roughRect({ x: b.x + 3, y: b.y + 3, width: b.width - 6, height: b.height - 6 }, `${node.id}-inner`, hand * 0.64, 14)}" fill="${color}" fill-opacity="0.022" stroke="${color}" stroke-width="0.82" opacity="0.48"/>${icon(node, b.x + 16, b.y + Math.max(12, b.height / 2 - 21), color)}${textLines(titleLines, titleX, titleY, titleSize + 2, `fill="${theme.ink}" font-family="${xml(theme.bodyFont)}" font-size="${titleSize}" font-weight="700"`)}${textLines(desc, titleX, descriptionY, 16, `fill="${theme.mutedInk}" font-family="${xml(theme.bodyFont)}" font-size="${descriptionSize}"`)}</g>`;
  }).join("");

  const notePositions: Record<string, [number, number, string]> = {
    "top-left": [64, 142, "start"], "top-right": [width - 64, 104, "end"], "bottom-left": [64, height - 28, "start"], "bottom-right": [width - 64, height - 28, "end"],
  };
  const notes = (spec.notes ?? []).map((note, index) => {
    const [x, y, anchor] = notePositions[note.anchor ?? (index % 2 ? "bottom-right" : "bottom-left")];
    return `<text x="${x}" y="${y - index * 20}" text-anchor="${anchor}" fill="${note.color ?? theme.mutedInk}" font-family="${xml(theme.titleFont)}" font-size="15" font-style="italic">${xml(note.text)}</text>`;
  }).join("");

  const corners = `<g fill="none" stroke="${theme.ink}" opacity="0.22"><path d="M20 42V20h22M${width - 42} 20h22v22M20 ${height - 42}v22h22M${width - 42} ${height - 20}h22v-22"/><circle cx="20" cy="20" r="5"/><circle cx="${width - 20}" cy="20" r="5"/><circle cx="20" cy="${height - 20}" r="5"/><circle cx="${width - 20}" cy="${height - 20}" r="5"/></g>`;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}${background}${title}${groups}${edgeSvg}${nodes}${notes}${corners}</svg>`;
}
