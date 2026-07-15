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
import { paintMotionFrame } from "../src/motion.js";

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

test("三种布局的分区不重叠且连线避开非端点节点", async () => {
  const base = await fixture();
  for (const mode of ["layered", "lanes", "radial"] as const) {
    const spec = structuredClone(base);
    spec.layout.mode = mode;
    spec.layout.direction = mode === "lanes" ? "vertical" : "horizontal";
    const scene = buildScene(spec);
    for (let left = 0; left < scene.groups.length; left += 1) {
      for (let right = left + 1; right < scene.groups.length; right += 1) {
        const a = scene.groups[left].box;
        const b = scene.groups[right].box;
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        assert.equal(overlaps, false, `${mode}:group:${scene.groups[left].id}-${scene.groups[right].id}`);
      }
    }
    for (const edge of scene.edges) {
      const obstacles = scene.nodes.filter((node) => node.id !== edge.from && node.id !== edge.to);
      for (let segment = 1; segment < edge.path.length; segment += 1) {
        const from = edge.path[segment - 1];
        const to = edge.path[segment];
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const samples = Math.max(2, Math.ceil(length / 5));
        for (let index = 1; index < samples; index += 1) {
          const t = index / samples;
          const x = from[0] + (to[0] - from[0]) * t;
          const y = from[1] + (to[1] - from[1]) * t;
          for (const obstacle of obstacles) {
            const inside = x > obstacle.box.x - 1 && x < obstacle.box.x + obstacle.box.width + 1 && y > obstacle.box.y - 1 && y < obstacle.box.y + obstacle.box.height + 1;
            assert.equal(inside, false, `${mode}:${edge.from}->${edge.to}:穿过${obstacle.id}`);
          }
        }
      }
    }
  }
});

test("长中文标题在高密度布局中会自动换行且不会产生无效坐标", async () => {
  const spec = await fixture();
  spec.groups[0].title = "多模态用户信号接入与上下文理解";
  spec.nodes[0].title = "跨渠道对话消息归一化处理";
  spec.nodes[0].description = "处理公众号、企业聊天、网页表单和语音转写产生的超长中文上下文说明";
  const svg = renderSvg(buildScene(spec));
  assert.match(svg, /<tspan/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test("默认分层主题保留非对称构图、汇聚枢纽和手绘图例", async () => {
  const scene = buildScene(await fixture());
  assert.notEqual(scene.groups[0].box.y, scene.groups[1].box.y);
  assert.notEqual(scene.groups[0].box.width, scene.groups[2].box.width);
  const svg = renderSvg(scene);
  assert.match(svg, /id="atlas-junctions"/);
  assert.match(svg, /id="showcase-legend"/);
  assert.match(svg, /#CC654B|#cc654b/);
  const rasterSvg = renderSvg(scene, { rasterOptimized: true });
  assert.match(rasterSvg, /numOctaves="1"/);
  assert.doesNotMatch(rasterSvg, /feDisplacementMap/);
});

test("展示模板包含参考构图的全部可编辑语义装饰", async () => {
  const scene = buildScene(await fixture());
  const svg = renderSvg(scene);
  for (const id of ["showcase-memory", "showcase-legend", "showcase-compass", "showcase-landscape"]) {
    assert.match(svg, new RegExp(`id="${id}"`));
  }
  assert.match(svg, /设计原则/);
  assert.match(svg, /记忆与上下文/);

  const excalidraw = JSON.parse(renderExcalidraw(scene));
  const ids = new Set(excalidraw.elements.map((element: { id: string }) => element.id));
  for (const id of ["showcase-memory-body", "showcase-principles", "showcase-legend", "showcase-compass", "showcase-landscape"]) {
    assert.ok(ids.has(id), `Excalidraw 缺少 ${id}`);
  }
});

test("SVG 与 Excalidraw 保留中文内容和唯一元素 ID", async () => {
  const scene = buildScene(await fixture());
  const svg = renderSvg(scene, { animatedSvg: true });
  assert.match(svg, /系统图谱/);
  assert.match(svg, /animateMotion/);
  assert.match(svg, /id="atlas-node-pulses"/);
  const animatedEdges = scene.edges.filter((edge) => edge.animated).length;
  assert.equal(svg.match(/<animateMotion/g)?.length, animatedEdges * 5);
  const excalidraw = JSON.parse(renderExcalidraw(scene));
  const ids = excalidraw.elements.map((element: { id: string }) => element.id);
  const indices = excalidraw.elements.map((element: { index: string }) => element.index);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(indices.length, new Set(indices).size);
  assert.ok(excalidraw.elements.some((element: { text?: string }) => element.text === "系统图谱"));
});

test("轻量 GIF 动态层包含拖尾、光晕和节点响应", async () => {
  const scene = buildScene(await fixture());
  const bytes = scene.spec.canvas.width * scene.spec.canvas.height * 4;
  const base = new Uint8Array(bytes);
  base.fill(246);
  for (let index = 3; index < bytes; index += 4) base[index] = 255;
  const first = paintMotionFrame(scene, base, 0);
  const later = paintMotionFrame(scene, base, 0.42);
  let changedFromBase = 0;
  let changedAcrossFrames = 0;
  for (let index = 0; index < bytes; index += 4) {
    if (first[index] !== base[index] || first[index + 1] !== base[index + 1] || first[index + 2] !== base[index + 2]) changedFromBase += 1;
    if (first[index] !== later[index] || first[index + 1] !== later[index + 1] || first[index + 2] !== later[index + 2]) changedAcrossFrames += 1;
  }
  assert.ok(changedFromBase > 300, `动态像素过少：${changedFromBase}`);
  assert.ok(changedAcrossFrames > 300, `跨帧变化过少：${changedAcrossFrames}`);
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
