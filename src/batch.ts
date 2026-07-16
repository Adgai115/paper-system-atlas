import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildScene } from "./layout.js";
import { exportScene, verifyOutputs, type OutputFormat } from "./exporters.js";
import { planSpec } from "./planner.js";
import { applyCanvasPreset, applyThemePreset } from "./presets.js";
import { formatValidationError, parseAtlasSpec } from "./schema.js";
import type { LayoutMode } from "./types.js";

export interface BatchRequest {
  input: string;
  outdir: string;
  recursive?: boolean;
  verify?: boolean;
  layout?: LayoutMode | "auto";
  theme?: string | "auto";
  canvas?: string | "auto";
  formats?: OutputFormat[];
  manifest?: string;
}

export interface BatchItem {
  source: string;
  basename: string;
  ok: boolean;
  applied?: { layout: LayoutMode; theme: string; canvas: string; formats: OutputFormat[] };
  files?: Partial<Record<OutputFormat, string>>;
  verification?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface BatchManifest {
  ok: boolean;
  version: 1;
  input: string;
  outdir: string;
  total: number;
  succeeded: number;
  failed: number;
  items: BatchItem[];
  manifest: string;
}

async function collectSpecs(input: string, recursive: boolean): Promise<string[]> {
  const resolved = path.resolve(input);
  const info = await stat(resolved);
  if (info.isFile()) {
    if (path.extname(resolved).toLowerCase() !== ".json") throw new Error("batch 输入文件必须是 .json 规格");
    return [resolved];
  }
  if (!info.isDirectory()) throw new Error("batch 输入必须是 .json 文件或目录");
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory() && recursive) await visit(target);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".json") files.push(target);
    }
  }
  await visit(resolved);
  if (files.length === 0) throw new Error("batch 输入中没有找到 .json 规格");
  return files;
}

function outputBasename(filePath: string, inputRoot: string): string {
  const root = path.extname(inputRoot) ? path.dirname(inputRoot) : inputRoot;
  const relative = path.relative(path.resolve(root), filePath).replace(/\.json$/i, "");
  return relative.replace(/[\\/]+/g, "--").replace(/[^a-zA-Z0-9_-]+/g, "-") || "system-map";
}

export async function runBatch(request: BatchRequest): Promise<BatchManifest> {
  const input = path.resolve(request.input);
  const outdir = path.resolve(request.outdir);
  const files = await collectSpecs(input, request.recursive ?? false);
  const items: BatchItem[] = [];
  for (const filePath of files) {
    const basename = outputBasename(filePath, input);
    try {
      const spec = parseAtlasSpec(JSON.parse(await readFile(filePath, "utf8")));
      const plan = planSpec(spec, filePath);
      const layout = request.layout && request.layout !== "auto" ? request.layout : plan.recommendation.layout;
      const theme = request.theme && request.theme !== "auto" ? request.theme : plan.recommendation.theme;
      const canvas = request.canvas && request.canvas !== "auto" ? request.canvas : plan.recommendation.canvas;
      const formats = request.formats ?? plan.recommendation.formats as OutputFormat[];
      spec.layout.mode = layout;
      spec.layout.direction = layout === "lanes" ? "vertical" : "horizontal";
      spec.layout.profile = layout === "layered" && spec.groups.length === 4 ? "atlas-showcase" : "adaptive";
      applyThemePreset(spec, theme);
      applyCanvasPreset(spec, canvas);
      const result = await exportScene(buildScene(spec), { outdir: path.join(outdir, basename), basename, formats });
      const verification = request.verify === false ? undefined : await verifyOutputs(result, spec);
      const ok = verification ? verification.ok === true : true;
      items.push({ source: filePath, basename, ok, applied: { layout, theme, canvas, formats }, files: result.files, verification });
    } catch (error) {
      items.push({ source: filePath, basename, ok: false, error: { code: "batch_item_failed", message: formatValidationError(error) } });
    }
  }
  const succeeded = items.filter((item) => item.ok).length;
  const manifestPath = path.resolve(request.manifest ?? path.join(outdir, "batch-manifest.json"));
  const manifest: BatchManifest = {
    ok: succeeded === items.length,
    version: 1,
    input,
    outdir,
    total: items.length,
    succeeded,
    failed: items.length - succeeded,
    items,
    manifest: manifestPath,
  };
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}
