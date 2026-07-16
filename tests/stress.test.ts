import test from "node:test";
import assert from "node:assert/strict";
import { parseAtlasSpec } from "../src/schema.js";
import { buildScene } from "../src/layout.js";
import { renderSvg } from "../src/svg.js";
import { renderExcalidraw } from "../src/excalidraw.js";
import type { AtlasSpec, LayoutMode } from "../src/types.js";

function complexSpec(nodesPerGroup = 8, edgeLimit = 160): AtlasSpec {
  const colors = ["#B04A37", "#1E7772", "#3569A7", "#906314", "#705B98"];
  const groups = Array.from({ length: 8 }, (_, index) => ({
    id: `group-${index + 1}`,
    title: `复杂分区 ${index + 1}`,
    note: `第 ${index + 1} 组的高密度能力与反馈`,
    color: colors[index % colors.length],
  }));
  const nodeCount = groups.length * nodesPerGroup;
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index + 1}`,
    group: groups[Math.floor(index / nodesPerGroup)].id,
    title: `能力节点 ${index + 1}`,
    description: `处理跨分区任务、状态、校验和反馈 ${index + 1}`,
    icon: (["target", "plan", "route", "shield", "knowledge", "code", "report", "memory"] as const)[index % 8],
  }));
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < nodeCount - 1; index += 1) pairs.push([index, index + 1]);
  for (let index = 0; index < nodeCount - nodesPerGroup; index += 1) pairs.push([index, index + nodesPerGroup]);
  for (let index = 0; index < nodeCount - nodesPerGroup * 2 - 1; index += 1) pairs.push([index, index + nodesPerGroup * 2 + 1]);
  const edges = pairs.slice(0, edgeLimit).map(([from, to], index) => ({
    from: nodes[from].id,
    to: nodes[to].id,
    label: index % 9 === 0 ? `链路 ${index + 1}` : undefined,
    kind: (["signal", "task", "result", "feedback"] as const)[index % 4],
    animated: index % 3 !== 0,
  }));
  return parseAtlasSpec({
    meta: { title: "复杂系统压力图", subtitle: `8 分区 · ${nodeCount} 节点 · ${edges.length} 连线`, description: "验证布局、路由、SVG 和 Excalidraw 在高密度规格下的稳定性" },
    canvas: { width: 3840, height: 2160, fps: 8, frames: 16 },
    layout: { mode: "layered", direction: "horizontal", profile: "adaptive" },
    theme: {
      name: "paper-color", paper: "#F6EEDD", ink: "#243B56", mutedInk: "#5F625E", palette: colors,
      titleFont: "STKaiti, KaiTi, serif", bodyFont: "Microsoft YaHei, Noto Sans CJK SC, sans-serif", texture: 0.3, handDrawn: 0.65,
    },
    groups,
    nodes,
    edges,
    notes: [{ text: "规格上限压力验证", anchor: "top-right" }],
  });
}

test("规格校验支持 8 分区、64 节点和 160 连线的上限", () => {
  const spec = complexSpec();
  assert.equal(spec.groups.length, 8);
  assert.equal(spec.nodes.length, 64);
  assert.equal(spec.edges.length, 160);
});

test("三种布局可真实渲染 8 分区、32 节点和 64 连线的复杂图", { timeout: 120_000 }, () => {
  const base = complexSpec(4, 64);
  for (const mode of ["layered", "lanes", "radial"] as LayoutMode[]) {
    const spec = structuredClone(base);
    spec.layout.mode = mode;
    spec.layout.direction = mode === "lanes" ? "vertical" : "horizontal";
    if (mode === "radial") spec.layout.hub = { title: "压力测试中枢", description: "复杂依赖与反馈汇聚" };
    const scene = buildScene(spec);
    assert.equal(scene.groups.length, 8, mode);
    assert.equal(scene.nodes.length, 32, mode);
    assert.equal(scene.edges.length, 64, mode);
    for (const item of [...scene.groups, ...scene.nodes]) {
      assert.ok([item.box.x, item.box.y, item.box.width, item.box.height].every(Number.isFinite), `${mode}:${item.id}`);
      assert.ok(item.box.width > 0 && item.box.height > 0, `${mode}:${item.id}:size`);
    }
    for (const edge of scene.edges) assert.ok(edge.path.flat().every(Number.isFinite), `${mode}:${edge.from}->${edge.to}`);
    const svg = renderSvg(scene);
    const excalidraw = renderExcalidraw(scene);
    assert.ok(svg.length > 60_000, `${mode}:svg-size`);
    assert.doesNotMatch(svg, /NaN|Infinity/);
    const excalidrawDocument = JSON.parse(excalidraw) as { elements: unknown[] };
    assert.ok(excalidrawDocument.elements.length > 96, `${mode}:excalidraw-elements`);
  }
});
