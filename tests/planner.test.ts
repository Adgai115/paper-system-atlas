import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAtlasSpec } from "../src/schema.js";
import { planDocument, planSpec } from "../src/planner.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("planSpec 比较三种布局并给出可执行建议", async () => {
  const raw = JSON.parse(await readFile(path.join(root, "examples", "intelligent-collaboration.json"), "utf8"));
  const result = planSpec(parseAtlasSpec(raw), "examples/intelligent-collaboration.json");
  assert.equal(result.ok, true);
  assert.equal(result.source, "spec");
  assert.equal(result.candidates?.length, 3);
  assert.match(result.nextCommand ?? "", /paper-atlas render/);
  assert.ok(result.recommendation.formats.includes("svg"));
});

test("planDocument 从闭环语义推荐径向布局", () => {
  const result = planDocument("输入经过分析与执行后进入反馈闭环，失败会重试，结果继续学习并迭代下一轮。", "loop.md");
  assert.equal(result.recommendation.layout, "radial");
  assert.equal(result.recommendation.profile, "adaptive");
  assert.match(result.nextCommand ?? "", /paper-atlas compose/);
});

test("planDocument 拒绝没有规划价值的短输入", () => {
  assert.throws(() => planDocument("太短"), /内容过短/);
});
