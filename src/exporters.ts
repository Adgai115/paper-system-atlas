import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import gifenc from "gifenc";
import type { AtlasSpec, Scene } from "./types.js";
import { renderSvg } from "./svg.js";
import { renderExcalidraw } from "./excalidraw.js";

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

async function exportGif(scene: Scene, target: string): Promise<void> {
  const { GIFEncoder, applyPalette, quantize } = gifenc;
  const { width, height, frames, fps } = scene.spec.canvas;
  const encoder = GIFEncoder();
  for (let index = 0; index < frames; index += 1) {
    const svg = renderSvg(scene, { frameProgress: index / frames });
    const pixels = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    const palette = quantize(pixels, 256, { format: "rgba4444" });
    const indexed = applyPalette(pixels, palette, "rgba4444");
    encoder.writeFrame(indexed, width, height, { palette, delay: Math.round(1000 / fps), repeat: index === 0 ? 0 : undefined });
  }
  encoder.finish();
  await writeFile(target, encoder.bytes());
}

export async function exportScene(scene: Scene, request: ExportRequest): Promise<ExportResult> {
  await mkdir(request.outdir, { recursive: true });
  const files: ExportResult["files"] = {};
  const file = (format: OutputFormat, extension = format) => path.resolve(request.outdir, `${request.basename}.${extension}`);
  const staticSvg = renderSvg(scene);
  for (const format of request.formats) {
    if (format === "svg") {
      const target = file(format);
      await writeFile(target, renderSvg(scene, { animatedSvg: true }), "utf8");
      files.svg = target;
    } else if (format === "png") {
      const target = file(format);
      await sharp(Buffer.from(staticSvg)).png({ compressionLevel: 9 }).toFile(target);
      files.png = target;
    } else if (format === "jpg") {
      const target = file(format);
      await sharp(Buffer.from(staticSvg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(target);
      files.jpg = target;
    } else if (format === "gif") {
      const target = file(format);
      await exportGif(scene, target);
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
  return { ok: checks.every((check) => check.ok), checks };
}
