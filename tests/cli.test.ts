import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
