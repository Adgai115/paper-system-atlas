#!/usr/bin/env node
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { parseAtlasSpec, formatValidationError } from "./schema.js";
import { buildScene } from "./layout.js";
import { exportScene, verifyOutputs, type OutputFormat } from "./exporters.js";

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
  }
  const formats = String(args.formats ?? "svg,png,excalidraw").split(",").map((item) => item.trim()).filter(Boolean) as OutputFormat[];
  const supported = new Set<OutputFormat>(["svg", "png", "jpg", "gif", "excalidraw"]);
  for (const format of formats) if (!supported.has(format)) throw new Error(`不支持的格式: ${format}`);
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
  console.log(`纸上系统图谱 CLI\n\n命令:\n  render   生成 SVG/PNG/JPG/GIF/Excalidraw，可用 --layout 覆盖布局\n  validate 校验规格\n  doctor   检查 Windows 与运行环境\n\n示例:\n  paper-atlas render --spec examples/intelligent-collaboration.json --outdir outputs --basename demo --layout radial --formats svg,png,jpg,gif,excalidraw --verify`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === "help" || args.help) { usage(); return; }
  if (command === "render") await renderCommand(args);
  else if (command === "validate") await validateCommand(args);
  else if (command === "doctor") await doctorCommand();
  else throw new Error(`未知命令: ${command}`);
}

main().catch((error) => {
  console.error(`错误: ${formatValidationError(error)}`);
  process.exitCode = 1;
});
