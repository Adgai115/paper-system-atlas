import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAtlasSpec } from "../src/schema.js";

const exampleUrl = new URL("../examples/intelligent-collaboration.json", import.meta.url);
const loopShowcaseUrl = new URL("../examples/ai-loop-atlas-showcase.json", import.meta.url);
const loopAdaptiveUrl = new URL("../examples/ai-loop-adaptive.json", import.meta.url);

test("中文示例规格可以通过校验", async () => {
  const spec = parseAtlasSpec(JSON.parse(await readFile(exampleUrl, "utf8")));
  assert.equal(spec.meta.language, "zh-CN");
  assert.equal(spec.layout.profile, "atlas-showcase");
  assert.deepEqual([spec.canvas.width, spec.canvas.height], [1674, 941]);
  assert.equal(spec.groups.length, 4);
  assert.equal(spec.nodes.length, 16);
});

test("拒绝重复节点和悬空连线", async () => {
  const raw = JSON.parse(await readFile(exampleUrl, "utf8"));
  raw.nodes[1].id = raw.nodes[0].id;
  raw.edges[0].to = "missing";
  assert.throws(() => parseAtlasSpec(raw), /节点 id 重复|连线终点不存在/);
});

test("AI Loop 展示与自适应规格均可通过校验", async () => {
  const showcase = parseAtlasSpec(JSON.parse(await readFile(loopShowcaseUrl, "utf8")));
  const adaptive = parseAtlasSpec(JSON.parse(await readFile(loopAdaptiveUrl, "utf8")));
  assert.equal(showcase.layout.profile, "atlas-showcase");
  assert.equal(showcase.layout.mode, "layered");
  assert.equal(adaptive.layout.profile, "adaptive");
  assert.equal(adaptive.layout.mode, "radial");
  assert.ok(showcase.edges.some((edge) => edge.kind === "feedback"));
  assert.ok(adaptive.edges.filter((edge) => edge.kind === "feedback").length >= 3);
});
