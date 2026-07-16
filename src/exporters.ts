import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import gifenc from "gifenc";
import type { AtlasSpec, Scene } from "./types.js";
import { renderSvg } from "./svg.js";
import { renderExcalidraw } from "./excalidraw.js";
import { paintMotionFrame } from "./motion.js";
import { buildScene } from "./layout.js";

export type OutputFormat = "svg" | "png" | "jpg" | "gif" | "excalidraw";

export interface ExportRequest {
  outdir: string;
  basename: string;
  formats: OutputFormat[];
}

export interface ExportResult {
  files: Partial<Record<OutputFormat, string>>;
  width: number;
  height: number;
  frames?: number;
  fps?: number;
}

interface QualityItem {
  name: string;
  ok: boolean;
  detail?: unknown;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, padding = 0): boolean {
  return a.x < b.x + b.width + padding && a.x + a.width + padding > b.x && a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;
}

function textUnits(value: string): number {
  return [...value].reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : 0.56), 0);
}

function pathLength(points: [number, number][]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  return total;
}

export function analyzeSceneQuality(scene: Scene): { checks: QualityItem[]; warnings: QualityItem[] } {
  const checks: QualityItem[] = [];
  const warnings: QualityItem[] = [];
  const { width, height } = scene.spec.canvas;
  const outside = scene.nodes.filter((node) => node.box.x < 0 || node.box.y < 0 || node.box.x + node.box.width > width || node.box.y + node.box.height > height).map((node) => node.id);
  checks.push({ name: "scene_nodes_in_bounds", ok: outside.length === 0, detail: outside });

  const nodeOverlaps: string[] = [];
  for (let left = 0; left < scene.nodes.length; left += 1) for (let right = left + 1; right < scene.nodes.length; right += 1) {
    if (overlaps(scene.nodes[left].box, scene.nodes[right].box, -1)) nodeOverlaps.push(`${scene.nodes[left].id}:${scene.nodes[right].id}`);
  }
  checks.push({ name: "scene_node_overlaps", ok: nodeOverlaps.length === 0, detail: nodeOverlaps.slice(0, 24) });

  const groupOverlaps: string[] = [];
  for (let left = 0; left < scene.groups.length; left += 1) for (let right = left + 1; right < scene.groups.length; right += 1) {
    if (overlaps(scene.groups[left].box, scene.groups[right].box)) groupOverlaps.push(`${scene.groups[left].id}:${scene.groups[right].id}`);
  }
  checks.push({ name: "scene_group_overlaps", ok: groupOverlaps.length === 0, detail: groupOverlaps });

  const hubOverlaps = scene.hub ? scene.groups.filter((group) => overlaps(scene.hub!.box, group.box)).map((group) => group.id) : [];
  checks.push({ name: "scene_hub_clearance", ok: hubOverlaps.length === 0, detail: hubOverlaps });

  const crossings = new Set<string>();
  for (const edge of scene.edges) {
    const obstacles = scene.nodes.filter((node) => node.id !== edge.from && node.id !== edge.to);
    for (let segment = 1; segment < edge.path.length && crossings.size < 24; segment += 1) {
      const from = edge.path[segment - 1];
      const to = edge.path[segment];
      const samples = Math.max(2, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 8));
      for (let sample = 1; sample < samples; sample += 1) {
        const t = sample / samples;
        const point = { x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t };
        for (const obstacle of obstacles) if (point.x > obstacle.box.x && point.x < obstacle.box.x + obstacle.box.width && point.y > obstacle.box.y && point.y < obstacle.box.y + obstacle.box.height) crossings.add(`${edge.from}->${edge.to}:${obstacle.id}`);
      }
    }
  }
  checks.push({ name: "scene_edges_avoid_nodes", ok: crossings.size === 0, detail: [...crossings] });

  const clippingRisk = scene.nodes.filter((node) => {
    const titleCapacity = Math.max(6, (node.box.width - 88) / 15) * 2;
    const descriptionCapacity = Math.max(7, (node.box.width - 86) / 10) * Math.max(1, Math.floor((node.box.height - 54) / 16) + 1);
    return textUnits(node.title) > titleCapacity || textUnits(node.description ?? "") > descriptionCapacity;
  }).map((node) => node.id);
  warnings.push({ name: "text_clipping_risk", ok: clippingRisk.length === 0, detail: { count: clippingRisk.length, nodes: clippingRisk.slice(0, 24) } });

  const density = scene.nodes.reduce((sum, node) => sum + node.box.width * node.box.height, 0) / (width * height);
  warnings.push({ name: "canvas_density", ok: density <= 0.44, detail: Number(density.toFixed(3)) });

  const diagonal = Math.hypot(width, height);
  const longEdges = scene.edges.filter((edge) => pathLength(edge.path) > diagonal * 2.2).map((edge) => `${edge.from}->${edge.to}`);
  warnings.push({ name: "long_edge_routes", ok: longEdges.length === 0, detail: longEdges.slice(0, 24) });

  const labelCollisions = scene.edges.filter((edge) => edge.label).flatMap((edge) => {
    const midpoint = edge.path[Math.floor(edge.path.length / 2)] ?? edge.path[0];
    const box = { x: midpoint[0] - 70, y: midpoint[1] - 18, width: 140, height: 36 };
    return scene.nodes.filter((node) => node.id !== edge.from && node.id !== edge.to && overlaps(box, node.box)).map((node) => `${edge.from}->${edge.to}:${node.id}`);
  });
  warnings.push({ name: "edge_label_collisions", ok: labelCollisions.length === 0, detail: labelCollisions.slice(0, 24) });
  return { checks, warnings };
}

interface StaticRaster {
  data: Buffer;
  width: number;
  height: number;
  channels: 4;
}

async function rasterizeStaticScene(scene: Scene, svg: string): Promise<StaticRaster> {
  const raster = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = scene.spec.canvas;
  if (raster.info.width !== width || raster.info.height !== height || raster.info.channels !== 4) {
    throw new Error(`静态底图尺寸异常：${raster.info.width}×${raster.info.height}×${raster.info.channels}`);
  }
  return { data: raster.data, width, height, channels: 4 };
}

function sharpFromRaster(raster: StaticRaster): sharp.Sharp {
  return sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: raster.channels } });
}

async function exportGif(scene: Scene, target: string, base: StaticRaster): Promise<void> {
  const { GIFEncoder, applyPalette, quantize } = gifenc;
  const { width, height, frames, fps } = scene.spec.canvas;
  const encoder = GIFEncoder();
  const representative = paintMotionFrame(scene, base.data, 0.37);
  const palette = quantize(representative, 256, { format: "rgba4444" });
  for (let index = 0; index < frames; index += 1) {
    const pixels = paintMotionFrame(scene, base.data, index / frames);
    const indexed = applyPalette(pixels, palette, "rgba4444");
    encoder.writeFrame(indexed, width, height, { palette: index === 0 ? palette : undefined, delay: Math.round(1000 / fps), repeat: index === 0 ? 0 : undefined });
  }
  encoder.finish();
  await writeFile(target, encoder.bytes());
}

export async function exportScene(scene: Scene, request: ExportRequest): Promise<ExportResult> {
  await mkdir(request.outdir, { recursive: true });
  const files: ExportResult["files"] = {};
  const file = (format: OutputFormat, extension = format) => path.resolve(request.outdir, `${request.basename}.${extension}`);
  const staticSvg = renderSvg(scene, { rasterOptimized: true });
  const needsRaster = request.formats.some((format) => format === "png" || format === "jpg" || format === "gif");
  const raster = needsRaster ? await rasterizeStaticScene(scene, staticSvg) : undefined;
  for (const format of request.formats) {
    if (format === "svg") {
      const target = file(format);
      await writeFile(target, renderSvg(scene, { animatedSvg: true }), "utf8");
      files.svg = target;
    } else if (format === "png") {
      const target = file(format);
      await sharpFromRaster(raster!).png({ compressionLevel: 9 }).toFile(target);
      files.png = target;
    } else if (format === "jpg") {
      const target = file(format);
      await sharpFromRaster(raster!).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(target);
      files.jpg = target;
    } else if (format === "gif") {
      const target = file(format);
      await exportGif(scene, target, raster!);
      files.gif = target;
    } else if (format === "excalidraw") {
      const target = file(format);
      await writeFile(target, renderExcalidraw(scene), "utf8");
      files.excalidraw = target;
    }
  }
  return { files, width: scene.spec.canvas.width, height: scene.spec.canvas.height, frames: files.gif ? scene.spec.canvas.frames : undefined, fps: files.gif ? scene.spec.canvas.fps : undefined };
}

export async function verifyOutputs(result: ExportResult, spec: AtlasSpec): Promise<Record<string, unknown>> {
  const checks: Array<{ name: string; ok: boolean; detail?: unknown }> = [];
  for (const [format, filePath] of Object.entries(result.files)) {
    const bytes = await readFile(filePath!);
    checks.push({ name: `${format}_nonempty`, ok: bytes.length > 100, detail: bytes.length });
  }
  if (result.files.png) {
    const metadata = await sharp(result.files.png).metadata();
    checks.push({ name: "png_dimensions", ok: metadata.width === spec.canvas.width && metadata.height === spec.canvas.height, detail: { width: metadata.width, height: metadata.height } });
  }
  if (result.files.jpg) {
    const metadata = await sharp(result.files.jpg).metadata();
    checks.push({ name: "jpg_dimensions", ok: metadata.width === spec.canvas.width && metadata.height === spec.canvas.height, detail: { width: metadata.width, height: metadata.height } });
  }
  if (result.files.gif) {
    const metadata = await sharp(result.files.gif, { animated: true }).metadata();
    checks.push({ name: "gif_dimensions", ok: metadata.width === spec.canvas.width && metadata.pageHeight === spec.canvas.height, detail: { width: metadata.width, pageHeight: metadata.pageHeight } });
    checks.push({ name: "gif_frames", ok: metadata.pages === spec.canvas.frames, detail: metadata.pages });
    const decoded = await sharp(result.files.gif, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pageHeight = metadata.pageHeight ?? spec.canvas.height;
    const pageSize = (metadata.width ?? spec.canvas.width) * pageHeight * decoded.info.channels;
    let changed = 0;
    if ((metadata.pages ?? 1) > 1 && decoded.data.length >= pageSize * 2) {
      const lastOffset = pageSize * ((metadata.pages ?? 1) - 1);
      for (let index = 0; index < pageSize; index += 4) {
        if (decoded.data[index] !== decoded.data[lastOffset + index] || decoded.data[index + 1] !== decoded.data[lastOffset + index + 1] || decoded.data[index + 2] !== decoded.data[lastOffset + index + 2]) changed += 1;
      }
    }
    checks.push({ name: "gif_has_motion", ok: changed > 100, detail: { sampledChangedPixels: changed } });
  }
  if (result.files.excalidraw) {
    const data = JSON.parse(await readFile(result.files.excalidraw, "utf8")) as { elements: Array<Record<string, unknown>>; files: Record<string, unknown> };
    const ids = data.elements.map((item) => item.id);
    const indices = data.elements.map((item) => item.index);
    const text = data.elements.filter((item) => item.type === "text");
    checks.push({ name: "excalidraw_unique_ids", ok: ids.length === new Set(ids).size, detail: ids.length });
    checks.push({ name: "excalidraw_unique_indices", ok: indices.length === new Set(indices).size, detail: indices.length });
    checks.push({ name: "excalidraw_font", ok: text.every((item) => item.fontFamily === 5), detail: text.length });
    checks.push({ name: "excalidraw_no_embeds", ok: Object.keys(data.files).length === 0 });
  }
  const quality = analyzeSceneQuality(buildScene(spec));
  checks.push(...quality.checks);
  return { ok: checks.every((check) => check.ok), checks, warnings: quality.warnings };
}
