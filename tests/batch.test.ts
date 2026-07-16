import test from "node:test";
import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBatch } from "../src/batch.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("batch 持续处理失败项并写入统一 manifest", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "图谱批处理-"));
  const input = path.join(temp, "specs");
  const outdir = path.join(temp, "outputs");
  try {
    await cp(path.join(root, "examples", "ai-loop-adaptive.json"), path.join(input, "valid.json"), { recursive: true });
    await writeFile(path.join(input, "invalid.json"), "{ invalid json", "utf8");
    const report = await runBatch({ input, outdir, formats: ["svg"], verify: true });
    assert.equal(report.ok, false);
    assert.equal(report.total, 2);
    assert.equal(report.succeeded, 1);
    assert.equal(report.failed, 1);
    assert.equal(report.items.find((item) => item.basename === "invalid")?.error?.code, "batch_item_failed");
    await access(path.join(outdir, "valid", "valid.svg"));
    const saved = JSON.parse(await readFile(report.manifest, "utf8")) as { total: number };
    assert.equal(saved.total, 2);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
