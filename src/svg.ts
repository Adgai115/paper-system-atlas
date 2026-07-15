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

function roughRect(box: Box, seed: string, amount: number): string {
  const { x, y, width: w, height: h } = box;
  const j = (slot: number) => jitter(seed, amount, slot).toFixed(2);
  return `M ${x + Number(j(1))} ${y + Number(j(2))} Q ${x + w / 2} ${y + Number(j(3))} ${x + w + Number(j(4))} ${y + Number(j(5))} Q ${x + w + Number(j(6))} ${y + h / 2} ${x + w + Number(j(7))} ${y + h + Number(j(8))} Q ${x + w / 2} ${y + h + Number(j(9))} ${x + Number(j(10))} ${y + h + Number(j(11))} Q ${x + Number(j(12))} ${y + h / 2} ${x + Number(j(13))} ${y + Number(j(14))} Z`;
}

function wrapText(text: string, maxUnits: number, maxLines = 3): string[] {
  const source = String(text ?? "").trim();
  if (!source) return [];
  const tokens = /[\u3400-\u9fff]/.test(source) ? [...source] : source.split(/\s+/);
  const separator = /[\u3400-\u9fff]/.test(source) ? "" : " ";
  const lines: string[] = [];
  let line = "";
  const units = (value: string) => [...value].reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : 0.56), 0);
  for (const token of tokens) {
    const next = line ? `${line}${separator}${token}` : token;
    if (line && units(next) > maxUnits) {
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

function cubicPath(edge: LayoutEdge): string {
  const [a, b, c, d] = edge.path;
  return `M ${a[0]} ${a[1]} C ${b[0]} ${b[1]} ${c[0]} ${c[1]} ${d[0]} ${d[1]}`;
}

function cubicPoint(edge: LayoutEdge, t: number): [number, number] {
  const [p0, p1, p2, p3] = edge.path;
  const u = 1 - t;
  return [u ** 3 * p0[0] + 3 * u ** 2 * t * p1[0] + 3 * u * t ** 2 * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u ** 2 * t * p1[1] + 3 * u * t ** 2 * p2[1] + t ** 3 * p3[1]];
}

export function renderSvg(scene: Scene, options: RenderOptions = {}): string {
  const { spec } = scene;
  const { width, height } = spec.canvas;
  const theme = spec.theme;
  const hand = Math.max(0.2, theme.handDrawn) * 3.5;
  const defs = `<defs>
    <filter id="paperNoise" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="13"/><feColorMatrix values="0 0 0 0 0.45 0 0 0 0 0.38 0 0 0 0 0.25 0 0 0 ${0.08 * theme.texture} 0"/></filter>
    <filter id="softWash" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker>
  </defs>`;

  const background = `<rect width="${width}" height="${height}" fill="${theme.paper}"/><rect width="${width}" height="${height}" filter="url(#paperNoise)" opacity="0.8"/>`;
  const title = `<g><text x="64" y="68" fill="${theme.ink}" font-family="${xml(theme.titleFont)}" font-size="52" font-weight="700">${xml(spec.meta.title)}</text>${spec.meta.subtitle ? `<text x="66" y="108" fill="${theme.mutedInk}" font-family="${xml(theme.bodyFont)}" font-size="20">${xml(spec.meta.subtitle)}</text>` : ""}<path d="M64 124 C190 118 320 132 455 122" stroke="${theme.palette[0]}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8"/></g>`;

  const edgeSvg = scene.edges.map((edge, index) => {
    const path = cubicPath(edge);
    const base = `<path id="edge-${index}" d="${path}" fill="none" stroke="${edge.color}" stroke-width="2.4" stroke-opacity="0.64" marker-end="url(#arrow)" stroke-linecap="round"/>`;
    const accent = `<path d="${path}" fill="none" stroke="${edge.color}" stroke-width="1.2" stroke-dasharray="2 8" stroke-opacity="0.8"/>`;
    if (!edge.animated) return base + accent;
    if (options.animatedSvg) return `${base}${accent}<circle r="5" fill="${edge.color}"><animateMotion dur="3.2s" begin="${(index % 7) * -0.37}s" repeatCount="indefinite" path="${path}"/></circle>`;
    if (options.frameProgress !== undefined) {
      const point = cubicPoint(edge, (options.frameProgress + index * 0.113) % 1);
      return `${base}${accent}<circle cx="${point[0]}" cy="${point[1]}" r="7" fill="${edge.color}" opacity="0.22"/><circle cx="${point[0]}" cy="${point[1]}" r="3.2" fill="${edge.color}"/>`;
    }
    return base + accent;
  }).join("");

  const groups = scene.groups.map((group) => {
    const b = group.box;
    const lane = spec.layout.mode === "lanes" || spec.layout.direction === "vertical";
    const wash = { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 };
    return `<g id="group-${xml(group.id)}"><path d="${roughRect(wash, `${group.id}-wash`, hand * 1.8)}" fill="${group.color}" opacity="0.075" filter="url(#softWash)"/><path d="${roughRect(b, group.id, hand)}" fill="${group.color}" fill-opacity="0.055" stroke="${group.color}" stroke-width="2" stroke-dasharray="7 5"/><circle cx="${b.x + 25}" cy="${b.y + 29}" r="18" fill="${theme.paper}" stroke="${group.color}" stroke-width="2"/><text x="${b.x + 25}" y="${b.y + 36}" text-anchor="middle" fill="${group.color}" font-family="${xml(theme.titleFont)}" font-size="22" font-weight="700">${group.index + 1}</text><text x="${b.x + 54}" y="${b.y + 38}" fill="${group.color}" font-family="${xml(theme.titleFont)}" font-size="27" font-weight="700">${xml(group.title)}</text>${group.note ? `<text x="${lane ? b.x + Math.min(230, b.width * 0.25) : b.x + 22}" y="${lane ? b.y + 36 : b.y + 62}" fill="${theme.mutedInk}" font-family="${xml(theme.bodyFont)}" font-size="12">${xml(group.note)}</text>` : ""}</g>`;
  }).join("");

  const nodes = scene.nodes.map((node) => {
    const b = node.box;
    const group = scene.groups.find((item) => item.id === node.group)!;
    const color = node.color ?? group.color;
    const titleSize = b.width < 220 ? 17 : 20;
    const descriptionSize = b.width < 220 ? 11 : 13;
    const titleX = b.x + 70;
    const titleY = b.y + Math.min(35, b.height * 0.36);
    const desc = wrapText(node.description ?? "", Math.max(7, (b.width - 86) / (descriptionSize * 0.86)), b.height < 92 ? 2 : 3);
    const angle = jitter(node.id, 0.34, 90).toFixed(3);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const washBox = { x: b.x - 5, y: b.y - 4, width: b.width + 10, height: b.height + 8 };
    return `<g id="node-${xml(node.id)}" transform="rotate(${angle} ${cx} ${cy})"><path d="${roughRect(washBox, `${node.id}-wash`, hand * 1.1)}" fill="${color}" opacity="0.09" filter="url(#softWash)"/><path d="${roughRect(b, node.id, hand * 0.9)}" fill="${theme.paper}" fill-opacity="0.72" stroke="${color}" stroke-width="2.25"/><path d="${roughRect({ x: b.x + 3, y: b.y + 3, width: b.width - 6, height: b.height - 6 }, `${node.id}-inner`, hand * 0.58)}" fill="${color}" fill-opacity="0.025" stroke="${color}" stroke-width="0.9" opacity="0.42"/>${icon(node, b.x + 16, b.y + Math.max(12, b.height / 2 - 21), color)}<text x="${titleX}" y="${titleY}" fill="${theme.ink}" font-family="${xml(theme.bodyFont)}" font-size="${titleSize}" font-weight="700">${xml(node.title)}</text>${textLines(desc, titleX, titleY + 23, 17, `fill="${theme.mutedInk}" font-family="${xml(theme.bodyFont)}" font-size="${descriptionSize}"`)}</g>`;
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
