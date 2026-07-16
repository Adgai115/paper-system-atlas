#!/usr/bin/env node
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { parseAtlasSpec, formatValidationError } from "./schema.js";
import { buildScene } from "./layout.js";
import { exportScene, verifyOutputs, type OutputFormat } from "./exporters.js";
import { composeDocument, createOpenAICompatibleClient, type ApiStyle, type ComposerProfile } from "./composer.js";
import type { AtlasSpec, LayoutMode } from "./types.js";

interface Args { _: string[]; [key: string]: string[] | string | boolean; }

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { args._.push(token); continue; }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

function required(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value) throw new Error(`缺少必需参数 --${key}`);
  return value;
}

async function loadSpec(filePath: string) {
  const raw = JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  return parseAtlasSpec(raw);
}

async function renderCommand(args: Args): Promise<void> {
  const spec = await loadSpec(required(args, "spec"));
  if (typeof args.layout === "string") {
    if (!(["layered", "lanes", "radial"] as string[]).includes(args.layout)) throw new Error(`不支持的布局: ${args.layout}`);
    spec.layout.mode = args.layout as "layered" | "lanes" | "radial";
    spec.layout.direction = args.layout === "lanes" ? "vertical" : "horizontal";
    if (args.layout !== "layered") spec.layout.profile = "adaptive";
  }
  const formats = outputFormats(args);
  const scene = buildScene(spec);
  const result = await exportScene(scene, { outdir: required(args, "outdir"), basename: typeof args.basename === "string" ? args.basename : "system-map", formats });
  const report: Record<string, unknown> = { ok: true, result };
  if (args.verify) {
    report.verification = await verifyOutputs(result, spec);
    report.ok = (report.verification as { ok: boolean }).ok;
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.ok === false) process.exitCode = 1;
}

function outputFormats(args: Args, fallback = "svg,png,excalidraw"): OutputFormat[] {
  const formats = String(args.formats ?? fallback).split(",").map((item) => item.trim()).filter(Boolean) as OutputFormat[];
  const supported = new Set<OutputFormat>(["svg", "png", "jpg", "gif", "excalidraw"]);
  for (const format of formats) if (!supported.has(format)) throw new Error(`不支持的格式: ${format}`);
  return formats;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

async function createPreviewSheet(spec: AtlasSpec, previews: Array<{ layout: LayoutMode; png: string }>, target: string): Promise<void> {
  const width = 1800;
  const margin = 48;
  const gap = 26;
  const header = 112;
  const thumbWidth = Math.floor((width - margin * 2 - gap * (previews.length - 1)) / previews.length);
  const thumbHeight = Math.max(260, Math.round(thumbWidth * spec.canvas.height / spec.canvas.width));
  const height = header + thumbHeight + margin;
  const labels: Record<LayoutMode, string> = { layered: "分层", lanes: "泳道", radial: "径向" };
  const composites: sharp.OverlayOptions[] = [];
  for (const [index, preview] of previews.entries()) {
    composites.push({
      input: await sharp(preview.png).resize(thumbWidth, thumbHeight, { fit: "contain", background: spec.theme.paper }).png().toBuffer(),
      left: margin + index * (thumbWidth + gap),
      top: header,
    });
  }
  const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="${margin}" y="48" fill="${spec.theme.ink}" font-family="Microsoft YaHei, sans-serif" font-size="28" font-weight="700">${escapeXml(spec.meta.title)} · 多布局预览</text>${previews.map((preview, index) => `<text x="${margin + index * (thumbWidth + gap) + thumbWidth / 2}" y="91" text-anchor="middle" fill="${spec.theme.mutedInk}" font-family="Microsoft YaHei, sans-serif" font-size="20">${labels[preview.layout]}</text>`).join("")}</svg>`;
  composites.unshift({ input: Buffer.from(labelSvg), left: 0, top: 0 });
  await sharp({ create: { width, height, channels: 4, background: spec.theme.paper } }).composite(composites).png({ compressionLevel: 9 }).toFile(target);
}

async function previewCommand(args: Args): Promise<void> {
  const original = await loadSpec(required(args, "spec"));
  const requested = String(args.layouts ?? "layered,lanes,radial").split(",").map((item) => item.trim()).filter(Boolean);
  const supported = new Set<LayoutMode>(["layered", "lanes", "radial"]);
  for (const layout of requested) if (!supported.has(layout as LayoutMode)) throw new Error(`不支持的预览布局: ${layout}`);
  const layouts = [...new Set(requested)] as LayoutMode[];
  if (layouts.length === 0) throw new Error("--layouts 至少需要一个布局");
  const outdir = path.resolve(required(args, "outdir"));
  const basename = typeof args.basename === "string" ? args.basename : path.parse(required(args, "spec")).name;
  const formats = outputFormats(args, "png,svg");
  if (!formats.includes("png")) formats.push("png");
  const layoutDir = path.join(outdir, "layouts");
  const previews: Array<{ layout: LayoutMode; png: string }> = [];
  const results: Record<string, unknown> = {};
  for (const layout of layouts) {
    const spec = structuredClone(original);
    spec.layout.mode = layout;
    spec.layout.direction = layout === "lanes" ? "vertical" : "horizontal";
    if (layout !== "layered" || spec.groups.length !== 4) spec.layout.profile = "adaptive";
    const result = await exportScene(buildScene(spec), { outdir: layoutDir, basename: `${basename}-${layout}`, formats });
    const verification = args.verify ? await verifyOutputs(result, spec) : undefined;
    results[layout] = verification ? { result, verification } : result;
    previews.push({ layout, png: result.files.png! });
  }
  await mkdir(outdir, { recursive: true });
  const sheet = path.join(outdir, `${basename}-preview.png`);
  await createPreviewSheet(original, previews, sheet);
  const ok = Object.values(results).every((item) => !("verification" in (item as Record<string, unknown>)) || ((item as { verification: { ok: boolean } }).verification.ok));
  console.log(JSON.stringify({ ok, layouts, sheet, results }, null, 2));
  if (!ok) process.exitCode = 1;
}

async function composeCommand(args: Args): Promise<void> {
  const inputPath = path.resolve(required(args, "input"));
  const document = await readFile(inputPath, "utf8");
  const profile = String(args.profile ?? "atlas-showcase") as ComposerProfile;
  if (!(profile === "atlas-showcase" || profile === "adaptive")) throw new Error(`不支持的配置: ${profile}`);
  const apiStyle = String(args["api-style"] ?? process.env.PAPER_ATLAS_API_STYLE ?? "responses") as ApiStyle;
  if (!(apiStyle === "responses" || apiStyle === "chat-completions")) throw new Error(`不支持的模型接口风格: ${apiStyle}`);
  const apiKey = process.env.PAPER_ATLAS_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("未配置模型密钥。请设置 PAPER_ATLAS_API_KEY 或 OPENAI_API_KEY 环境变量");
  const model = typeof args.model === "string" ? args.model : process.env.PAPER_ATLAS_MODEL ?? process.env.OPENAI_MODEL;
  if (!model) throw new Error("未配置模型。请使用 --model 或设置 PAPER_ATLAS_MODEL / OPENAI_MODEL");
  const baseUrl = typeof args["base-url"] === "string" ? args["base-url"] : process.env.PAPER_ATLAS_BASE_URL ?? process.env.OPENAI_BASE_URL;
  const maxAttempts = Number(args["max-attempts"] ?? 3);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 4) throw new Error("--max-attempts 必须是 1-4 的整数");

  const composed = await composeDocument({
    document,
    profile,
    maxAttempts,
    client: createOpenAICompatibleClient({ apiKey, baseUrl, model, apiStyle }),
  });
  const outdir = path.resolve(required(args, "outdir"));
  const basename = typeof args.basename === "string" ? args.basename : path.parse(inputPath).name;
  const specPath = path.resolve(typeof args["spec-out"] === "string" ? args["spec-out"] : path.join(outdir, `${basename}.atlas.json`));
  await mkdir(path.dirname(specPath), { recursive: true });
  await writeFile(specPath, `${JSON.stringify(composed.spec, null, 2)}\n`, "utf8");

  const result = await exportScene(buildScene(composed.spec), { outdir, basename, formats: outputFormats(args) });
  const verification = await verifyOutputs(result, composed.spec);
  const report = {
    ok: verification.ok,
    composition: { profile, provider: composed.provider, model: composed.model, attempts: composed.attempts, input: inputPath, spec: specPath },
    result,
    verification,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!verification.ok) process.exitCode = 1;
}

async function validateCommand(args: Args): Promise<void> {
  const spec = await loadSpec(required(args, "spec"));
  console.log(JSON.stringify({ ok: true, title: spec.meta.title, groups: spec.groups.length, nodes: spec.nodes.length, edges: spec.edges.length }, null, 2));
}

async function doctorCommand(): Promise<void> {
  const checks: Array<Record<string, unknown>> = [];
  checks.push({ name: "node", ok: Number(process.versions.node.split(".")[0]) >= 20, value: process.versions.node });
  checks.push({ name: "platform", ok: true, value: `${process.platform} ${process.arch}` });
  checks.push({ name: "sharp", ok: true, value: sharp.versions.vips });
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  checks.push({ name: "ffmpeg_optional", ok: true, value: ffmpeg.status === 0 ? ffmpeg.stdout.split(/\r?\n/)[0] : "未安装；GIF 不依赖 FFmpeg" });
  if (process.platform === "win32") {
    const windir = process.env.WINDIR ?? "C:\\Windows";
    const candidates = ["msyh.ttc", "simkai.ttf", "simhei.ttf"].map((font) => path.join(windir, "Fonts", font));
    const found: string[] = [];
    for (const candidate of candidates) try { await access(candidate, constants.R_OK); found.push(candidate); } catch { /* optional */ }
    checks.push({ name: "windows_cjk_fonts", ok: found.length > 0, value: found });
  }
  const probe = path.join(os.tmpdir(), `纸上图谱-${process.pid}.txt`);
  try { await writeFile(probe, "中文路径正常", "utf8"); await rm(probe); checks.push({ name: "unicode_path", ok: true }); }
  catch (error) { checks.push({ name: "unicode_path", ok: false, value: String(error) }); }
  console.log(JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2));
}

function usage(): void {
  console.log(`纸上系统图谱 CLI\n\n命令:\n  compose  将 Markdown/TXT 文档编排为规格并生成全部图像\n  render   根据规格生成 SVG/PNG/JPG/GIF/Excalidraw，可用 --layout 覆盖布局\n  preview  一次生成多种布局并输出对比拼图\n  validate 校验规格\n  doctor   检查 Windows 与运行环境\n\n模型环境变量:\n  PAPER_ATLAS_API_KEY   模型密钥（也支持 OPENAI_API_KEY）\n  PAPER_ATLAS_MODEL     模型名称（也支持 OPENAI_MODEL）\n  PAPER_ATLAS_BASE_URL  API 根地址，默认 https://api.openai.com/v1\n  PAPER_ATLAS_API_STYLE responses 或 chat-completions\n\n示例:\n  paper-atlas compose --input article.md --profile atlas-showcase --outdir outputs --basename article-map --formats svg,png,jpg,gif,excalidraw\n  paper-atlas render --spec examples/intelligent-collaboration.json --outdir outputs --basename demo --layout radial --formats svg,png,jpg,gif,excalidraw --verify\n  paper-atlas preview --spec examples/intelligent-collaboration.json --outdir outputs/preview --basename demo --verify`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === "help" || args.help) { usage(); return; }
  if (command === "compose") await composeCommand(args);
  else if (command === "render") await renderCommand(args);
  else if (command === "preview") await previewCommand(args);
  else if (command === "validate") await validateCommand(args);
  else if (command === "doctor") await doctorCommand();
  else throw new Error(`未知命令: ${command}`);
}

main().catch((error) => {
  console.error(`错误: ${formatValidationError(error)}`);
  process.exitCode = 1;
});
