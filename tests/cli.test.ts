import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

test("preview CLI 生成多布局文件和对比拼图", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outdir = await mkdtemp(path.join(os.tmpdir(), "图谱预览-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "--import", "tsx", "src/cli.ts", "preview",
      "--spec", "examples/intelligent-collaboration.json",
      "--outdir", outdir,
      "--basename", "preview-test",
      "--layouts", "layered,radial",
      "--verify",
    ], { cwd: root, maxBuffer: 4_000_000 });
    const report = JSON.parse(stdout) as { ok: boolean; layouts: string[]; sheet: string; results: Record<string, unknown> };
    assert.equal(report.ok, true);
    assert.deepEqual(report.layouts, ["layered", "radial"]);
    assert.ok(report.results.layered && report.results.radial);
    await access(report.sheet);
    await access(path.join(outdir, "layouts", "preview-test-radial.svg"));
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});

test("plan CLI 可从标准输入接收文档并返回 JSON", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const child = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "plan", "--input", "-"], {
    cwd: root,
    input: "系统接收输入，经过处理和执行形成反馈闭环；失败后重试，并持续学习迭代。",
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout) as { ok: boolean; source: string };
  assert.equal(report.ok, true);
  assert.equal(report.source, "document");
});

test("CLI 错误使用结构化 stderr 和稳定退出码", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const child = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "unknown-command"], { cwd: root, encoding: "utf8" });
  assert.equal(child.status, 2);
  const report = JSON.parse(child.stderr) as { ok: boolean; error: { code: string }; exitCode: number };
  assert.equal(report.ok, false);
  assert.equal(report.error.code, "invalid_input");
  assert.equal(report.exitCode, 2);
});
