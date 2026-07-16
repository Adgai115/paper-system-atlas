import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAtlasSpec } from "../src/schema.js";
import { applyCanvasPreset, applyThemePreset, presetCatalog } from "../src/presets.js";

async function fixture() {
  return parseAtlasSpec(JSON.parse(await readFile(new URL("../examples/intelligent-collaboration.json", import.meta.url), "utf8")));
}

test("主题预设统一替换主题和语义颜色", async () => {
  const spec = await fixture();
  applyThemePreset(spec, "blueprint");
  assert.equal(spec.theme.name, "blueprint");
  assert.equal(spec.theme.paper, "#102A43");
  assert.equal(spec.groups[0].color, spec.theme.palette[0]);
  assert.ok(spec.edges.every((edge) => edge.color === undefined));
});

test("画布预设与目录可用于 CLI 和 Agent", async () => {
  const spec = await fixture();
  applyCanvasPreset(spec, "print-a4");
  assert.deepEqual([spec.canvas.width, spec.canvas.height], [1754, 1240]);
  const catalog = presetCatalog() as { themes: unknown[]; canvases: unknown[] };
  assert.ok(catalog.themes.length >= 4);
  assert.ok(catalog.canvases.length >= 5);
  assert.throws(() => applyThemePreset(spec, "missing"), /未知主题预设/);
});
