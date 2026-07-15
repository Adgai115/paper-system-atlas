import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseAtlasSpec } from "../src/schema.js";
import { buildScene } from "../src/layout.js";
import { renderSvg } from "../src/svg.js";
import { renderExcalidraw } from "../src/excalidraw.js";
import { exportScene, verifyOutputs } from "../src/exporters.js";

const exampleUrl = new URL("../examples/intelligent-collaboration.json", import.meta.url);

async function fixture() {
  return parseAtlasSpec(JSON.parse(await readFile(exampleUrl, "utf8")));
}

test("布局节点保持在画布内且同分区不重叠", async () => {
  const spec = await fixture();
  const scene = buildScene(spec);
  for (const node of scene.nodes) {
    assert.ok(node.box.x >= 0 && node.box.y >= 0);
    assert.ok(node.box.x + node.box.width <= spec.canvas.width);
    assert.ok(node.box.y + node.box.height <= spec.canvas.height);
  }
  for (const group of scene.groups) {
    const nodes = scene.nodes.filter((node) => node.group === group.id);
    for (let index = 1; index < nodes.length; index += 1) {
      assert.ok(nodes[index - 1].box.y + nodes[index - 1].box.height <= nodes[index].box.y);
    }
  }
});

test("分层、泳道和径向布局都保持节点在所属分区内", async () => {
  const base = await fixture();
  for (const mode of ["layered", "lanes", "radial"] as const) {
    const spec = structuredClone(base);
    spec.layout.mode = mode;
    spec.layout.direction = mode === "lanes" ? "vertical" : "horizontal";
    const scene = buildScene(spec);
    for (const node of scene.nodes) {
      const group = scene.groups.find((item) => item.id === node.group)!;
      assert.ok(node.box.x >= group.box.x, `${mode}:${node.id}:left`);
      assert.ok(node.box.y >= group.box.y, `${mode}:${node.id}:top`);
      assert.ok(node.box.x + node.box.width <= group.box.x + group.box.width, `${mode}:${node.id}:right`);
      assert.ok(node.box.y + node.box.height <= group.box.y + group.box.height, `${mode}:${node.id}:bottom`);
    }
  }
});

test("SVG 与 Excalidraw 保留中文内容和唯一元素 ID", async () => {
  const scene = buildScene(await fixture());
  const svg = renderSvg(scene, { animatedSvg: true });
  assert.match(svg, /系统图谱/);
  assert.match(svg, /animateMotion/);
  const excalidraw = JSON.parse(renderExcalidraw(scene));
  const ids = excalidraw.elements.map((element: { id: string }) => element.id);
  const indices = excalidraw.elements.map((element: { index: string }) => element.index);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(indices.length, new Set(indices).size);
  assert.ok(excalidraw.elements.some((element: { text?: string }) => element.text === "系统图谱"));
});

test("Windows 友好的中文路径可以输出主要静态格式", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "纸上图谱-"));
  try {
    const spec = await fixture();
    const result = await exportScene(buildScene(spec), { outdir: root, basename: "中文示例", formats: ["svg", "png", "jpg", "excalidraw"] });
    const verification = await verifyOutputs(result, spec);
    assert.equal(verification.ok, true, JSON.stringify(verification));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
