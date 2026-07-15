import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAtlasSpec } from "../src/schema.js";

const exampleUrl = new URL("../examples/intelligent-collaboration.json", import.meta.url);

test("中文示例规格可以通过校验", async () => {
  const spec = parseAtlasSpec(JSON.parse(await readFile(exampleUrl, "utf8")));
  assert.equal(spec.meta.language, "zh-CN");
  assert.equal(spec.groups.length, 4);
  assert.equal(spec.nodes.length, 16);
});

test("拒绝重复节点和悬空连线", async () => {
  const raw = JSON.parse(await readFile(exampleUrl, "utf8"));
  raw.nodes[1].id = raw.nodes[0].id;
  raw.edges[0].to = "missing";
  assert.throws(() => parseAtlasSpec(raw), /节点 id 重复|连线终点不存在/);
});
