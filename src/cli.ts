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
import { applyCanvasPreset, applyThemePreset, presetCatalog } from "./presets.js";
import { planDocument, planSpec } from "./planner.js";
import { runBatch } from "./batch.js";

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

async function readTextSource(source: string): Promise<string> {
  if (source !== "-") return readFile(path.resolve(source), "utf8");
  let content = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) content += chunk;
  if (!content.trim()) throw new Error("标准输入为空");
  return content;
}

function sourceBasename(source: string, fallback = "stdin-map"): string {
  return source === "-" ? fallback : path.parse(source).name;
}

async function loadSpec(filePath: string) {
  const raw = JSON.parse(await readTextSource(filePath));
  return parseAtlasSpec(raw);
}

async function planCommand(args: Args): Promise<void> {
  const specPath = typeof args.spec === "string" ? args.spec : undefined;
  const inputPath = typeof args.input === "string" ? args.input : undefined;
  if (Boolean(specPath) === Boolean(inputPath)) throw new Error("plan 必须且只能提供 --spec 或 --input");
  const plan = specPath
    ? planSpec(await loadSpec(specPath), specPath)
    : planDocument(await readTextSource(inputPath!), inputPath);
  console.log(JSON.stringify(plan, null, 2));
}

async function batchCommand(args: Args): Promise<void> {
  const layout = String(args.layout ?? "auto");
  if (!(layout === "auto" || ["layered", "lanes", "radial"].includes(layout))) throw new Error(`不支持的批量布局: ${layout}`);
  const report = await runBatch({
    input: required(args, "input"),
    outdir: required(args, "outdir"),
    recursive: args.recursive === true,
    verify: args["no-verify"] !== true,
    layout: layout as LayoutMode | "auto",
    theme: typeof args.theme === "string" ? args.theme : "auto",
    canvas: typeof args.canvas === "string" ? args.canvas : "auto",
    formats: typeof args.formats === "string" ? outputFormats(args) : undefined,
    manifest: typeof args.manifest === "string" ? args.manifest : undefined,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function applySpecOverrides(spec: AtlasSpec, args: Args): AtlasSpec {
  if (typeof args.theme === "string") applyThemePreset(spec, args.theme);
  if (typeof args.canvas === "string") applyCanvasPreset(spec, args.canvas);
  return spec;
}

async function renderCommand(args: Args): Promise<void> {
  const spec = applySpecOverrides(await loadSpec(required(args, "spec")), args);
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
  const specSource = required(args, "spec");
  const original = applySpecOverrides(await loadSpec(specSource), args);
  const requested = String(args.layouts ?? "layered,lanes,radial").split(",").map((item) => item.trim()).filter(Boolean);
  const supported = new Set<LayoutMode>(["layered", "lanes", "radial"]);
  for (const layout of requested) if (!supported.has(layout as LayoutMode)) throw new Error(`不支持的预览布局: ${layout}`);
  const layouts = [...new Set(requested)] as LayoutMode[];
  if (layouts.length === 0) throw new Error("--layouts 至少需要一个布局");
  const outdir = path.resolve(required(args, "outdir"));
  const basename = typeof args.basename === "string" ? args.basename : sourceBasename(specSource);
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
  const inputSource = required(args, "input");
  const inputPath = inputSource === "-" ? "stdin" : path.resolve(inputSource);
  const document = await readTextSource(inputSource);
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
  const apiTimeoutMs = Number(args["api-timeout-ms"] ?? process.env.PAPER_ATLAS_API_TIMEOUT_MS ?? 120_000);
  if (!Number.isInteger(apiTimeoutMs) || apiTimeoutMs < 100 || apiTimeoutMs > 600_000) throw new Error("--api-timeout-ms 必须是 100-600000 的整数");
  const apiRetries = Number(args["api-retries"] ?? process.env.PAPER_ATLAS_API_RETRIES ?? 2);
  if (!Number.isInteger(apiRetries) || apiRetries < 0 || apiRetries > 5) throw new Error("--api-retries 必须是 0-5 的整数");
  const apiRetryDelayMs = Number(args["api-retry-delay-ms"] ?? process.env.PAPER_ATLAS_API_RETRY_DELAY_MS ?? 500);
  if (!Number.isInteger(apiRetryDelayMs) || apiRetryDelayMs < 0 || apiRetryDelayMs > 30_000) throw new Error("--api-retry-delay-ms 必须是 0-30000 的整数");

  const composed = await composeDocument({
    document,
    profile,
    maxAttempts,
    client: createOpenAICompatibleClient({ apiKey, baseUrl, model, apiStyle, timeoutMs: apiTimeoutMs, maxRetries: apiRetries, retryDelayMs: apiRetryDelayMs }),
  });
  applySpecOverrides(composed.spec, args);
  const outdir = path.resolve(required(args, "outdir"));
  const basename = typeof args.basename === "string" ? args.basename : sourceBasename(inputSource);
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
  console.log(`纸上系统图谱 CLI\n\n命令:\n  plan     为文档或规格输出机器可读的布局、主题与格式建议\n  batch    批量渲染规格并输出统一 manifest（默认自动规划且逐项校验）\n  compose  将 Markdown/TXT 文档编排为规格并生成全部图像\n  render   根据规格生成 SVG/PNG/JPG/GIF/Excalidraw，可用 --layout 覆盖布局\n  preview  一次生成多种布局并输出对比拼图\n  presets  查看主题与画布预设\n  validate 校验规格\n  doctor   检查运行环境\n\nAgent 接口约定:\n  --input - / --spec - 从标准输入读取；成功写 JSON 到 stdout，失败写 JSON 到 stderr\n  退出码 1=执行或校验失败，2=参数或输入无效，3=模型配置失败，4=文件系统失败\n\n通用视觉参数:\n  --theme  paper-color、blueprint、whiteboard 或 ink-wash\n  --canvas presentation、article、wechat、square 或 print-a4\n\n模型环境变量:\n  PAPER_ATLAS_API_KEY          模型密钥（也支持 OPENAI_API_KEY）\n  PAPER_ATLAS_MODEL           模型名称（也支持 OPENAI_MODEL）\n  PAPER_ATLAS_BASE_URL        API 根地址，默认 https://api.openai.com/v1\n  PAPER_ATLAS_API_STYLE       responses 或 chat-completions\n  PAPER_ATLAS_API_TIMEOUT_MS  单次 HTTP 请求超时，默认 120000\n  PAPER_ATLAS_API_RETRIES     超时、限流和 5xx 重试次数，默认 2\n  PAPER_ATLAS_API_RETRY_DELAY_MS  指数退避初始间隔，默认 500\n\n示例:\n  paper-atlas plan --input article.md\n  Get-Content -Raw article.md | paper-atlas plan --input -\n  paper-atlas plan --spec examples/intelligent-collaboration.json\n  paper-atlas batch --input examples --outdir outputs/batch --layout auto --formats svg,png,excalidraw\n  paper-atlas compose --input article.md --profile atlas-showcase --outdir outputs --basename article-map --formats svg,png,jpg,gif,excalidraw --api-timeout-ms 120000 --api-retries 2\n  paper-atlas render --spec examples/intelligent-collaboration.json --outdir outputs --basename demo --layout radial --theme blueprint --canvas presentation --formats svg,png,excalidraw --verify\n  paper-atlas preview --spec examples/intelligent-collaboration.json --outdir outputs/preview --basename demo --verify`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === "help" || args.help) { usage(); return; }
  if (command === "plan") await planCommand(args);
  else if (command === "batch") await batchCommand(args);
  else if (command === "compose") await composeCommand(args);
  else if (command === "render") await renderCommand(args);
  else if (command === "preview") await previewCommand(args);
  else if (command === "presets") console.log(JSON.stringify(presetCatalog(), null, 2));
  else if (command === "validate") await validateCommand(args);
  else if (command === "doctor") await doctorCommand();
  else throw new Error(`未知命令: ${command}`);
}

main().catch((error) => {
  const message = formatValidationError(error);
  const filesystemCode = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  const providerFailure = /模型密钥|未配置模型|模型接口风格/.test(message);
  const argumentFailure = error instanceof SyntaxError || /缺少必需参数|不支持|未知命令|必须|输入文档内容过短|标准输入为空|规格/.test(message);
  const exitCode = providerFailure ? 3 : filesystemCode && ["ENOENT", "EACCES", "EPERM", "ENOSPC"].includes(filesystemCode) ? 4 : argumentFailure ? 2 : 1;
  const code = providerFailure ? "provider_config_error" : exitCode === 4 ? "filesystem_error" : exitCode === 2 ? "invalid_input" : "command_failed";
  console.error(JSON.stringify({ ok: false, error: { code, message }, exitCode }, null, 2));
  process.exitCode = exitCode;
});
