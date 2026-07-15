import type { AtlasGroup, AtlasNode, Box, LayoutEdge, LayoutGroup, LayoutNode, Scene, AtlasSpec } from "./types.js";

function groupColor(spec: AtlasSpec, group: AtlasGroup, index: number): string {
  return group.color ?? spec.theme.palette[index % spec.theme.palette.length];
}

function inset(box: Box, left: number, top: number, right = left, bottom = top): Box {
  return { x: box.x + left, y: box.y + top, width: box.width - left - right, height: box.height - top - bottom };
}

function layeredGroups(spec: AtlasSpec): LayoutGroup[] {
  const marginX = Math.max(42, spec.canvas.width * 0.035);
  const top = 160;
  const bottom = 78;
  const gap = Math.max(22, spec.canvas.width * 0.018);
  const count = spec.groups.length;
  const width = (spec.canvas.width - marginX * 2 - gap * (count - 1)) / count;
  const height = spec.canvas.height - top - bottom;
  return spec.groups.map((group, index) => ({
    ...group,
    index,
    color: groupColor(spec, group, index),
    box: { x: marginX + index * (width + gap), y: top, width, height },
  }));
}

function laneGroups(spec: AtlasSpec): LayoutGroup[] {
  const marginX = Math.max(54, spec.canvas.width * 0.045);
  const top = 156;
  const bottom = 64;
  const gap = 20;
  const count = spec.groups.length;
  const height = (spec.canvas.height - top - bottom - gap * (count - 1)) / count;
  return spec.groups.map((group, index) => ({
    ...group,
    index,
    color: groupColor(spec, group, index),
    box: { x: marginX, y: top + index * (height + gap), width: spec.canvas.width - marginX * 2, height },
  }));
}

function radialGroups(spec: AtlasSpec): LayoutGroup[] {
  const cx = spec.canvas.width / 2;
  const cy = spec.canvas.height / 2 + 42;
  const count = spec.groups.length;
  const boxWidth = Math.min(360, spec.canvas.width * 0.24);
  const boxHeight = Math.min(260, spec.canvas.height * 0.3);
  const rx = Math.max(boxWidth * 0.9, spec.canvas.width * 0.31);
  const ry = Math.max(boxHeight * 0.66, spec.canvas.height * 0.2);
  return spec.groups.map((group, index) => {
    const angle = -Math.PI * 0.75 + (Math.PI * 2 * index) / count;
    const x = Math.max(32, Math.min(spec.canvas.width - boxWidth - 32, cx + Math.cos(angle) * rx - boxWidth / 2));
    const y = Math.max(150, Math.min(spec.canvas.height - boxHeight - 42, cy + Math.sin(angle) * ry - boxHeight / 2));
    return { ...group, index, color: groupColor(spec, group, index), box: { x, y, width: boxWidth, height: boxHeight } };
  });
}

function layoutNodesInGroup(group: LayoutGroup, nodes: AtlasNode[], laneMode: boolean, radialMode: boolean): LayoutNode[] {
  const inner = inset(group.box, 18, laneMode ? 54 : 76, 18, laneMode ? 14 : 22);
  if (radialMode) {
    const columns = nodes.length <= 2 ? 1 : 2;
    const rows = Math.ceil(nodes.length / columns);
    const gapX = 14;
    const gapY = 12;
    const width = (inner.width - gapX * (columns - 1)) / columns;
    const height = (inner.height - gapY * (rows - 1)) / Math.max(1, rows);
    return nodes.map((node, index) => ({
      ...node,
      box: {
        x: inner.x + (index % columns) * (width + gapX),
        y: inner.y + Math.floor(index / columns) * (height + gapY),
        width,
        height,
      },
    }));
  }
  if (laneMode) {
    const gap = 18;
    const width = Math.min(300, (inner.width - gap * Math.max(0, nodes.length - 1)) / Math.max(1, nodes.length));
    const total = width * nodes.length + gap * Math.max(0, nodes.length - 1);
    const startX = inner.x + (inner.width - total) / 2;
    return nodes.map((node, index) => ({
      ...node,
      box: { x: startX + index * (width + gap), y: inner.y + 4, width, height: Math.max(54, inner.height - 8) },
    }));
  }

  const gap = Math.min(24, inner.height * 0.035);
  const height = Math.min(126, (inner.height - gap * Math.max(0, nodes.length - 1)) / Math.max(1, nodes.length));
  const total = height * nodes.length + gap * Math.max(0, nodes.length - 1);
  const startY = inner.y + Math.max(0, (inner.height - total) / 2);
  return nodes.map((node, index) => ({
    ...node,
    box: { x: inner.x + 4, y: startY + index * (height + gap), width: inner.width - 8, height },
  }));
}

function seedWave(value: string, magnitude: number): number {
  let seed = 0;
  for (const char of value) seed = (seed * 33 + char.charCodeAt(0)) | 0;
  return (((Math.abs(seed) % 1000) / 999) - 0.5) * magnitude * 2;
}

function connectionPath(from: Box, to: Box, key: string, feedback = false): [number, number][] {
  const fromCenter = [from.x + from.width / 2, from.y + from.height / 2] as [number, number];
  const toCenter = [to.x + to.width / 2, to.y + to.height / 2] as [number, number];
  if (feedback) {
    const start: [number, number] = [from.x, fromCenter[1]];
    const end: [number, number] = [to.x, toCenter[1]];
    const outsideX = Math.min(from.x, to.x) - 34 - Math.abs(seedWave(key, 15));
    return [start, [outsideX, start[1]], [outsideX, end[1]], end];
  }
  const dx = toCenter[0] - fromCenter[0];
  const dy = toCenter[1] - fromCenter[1];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const dir = Math.sign(dx) || 1;
    const start: [number, number] = [fromCenter[0] + dir * from.width / 2, fromCenter[1]];
    const end: [number, number] = [toCenter[0] - dir * to.width / 2, toCenter[1]];
    const bend = Math.max(34, Math.abs(end[0] - start[0]) * 0.46);
    const wave = seedWave(key, Math.min(48, Math.max(12, Math.abs(end[0] - start[0]) * 0.2)));
    return [start, [start[0] + dir * bend, start[1] + wave], [end[0] - dir * bend, end[1] - wave * 0.55], end];
  }
  const dir = Math.sign(dy) || 1;
  const start: [number, number] = [fromCenter[0], fromCenter[1] + dir * from.height / 2];
  const end: [number, number] = [toCenter[0], toCenter[1] - dir * to.height / 2];
  const bend = Math.max(30, Math.abs(end[1] - start[1]) * 0.46);
  return [start, [start[0], start[1] + dir * bend], [end[0], end[1] - dir * bend], end];
}

export function buildScene(spec: AtlasSpec): Scene {
  const laneMode = spec.layout.mode === "lanes" || spec.layout.direction === "vertical";
  const radialMode = spec.layout.mode === "radial";
  const groups = radialMode ? radialGroups(spec) : laneMode ? laneGroups(spec) : layeredGroups(spec);
  const nodes = groups.flatMap((group) => layoutNodesInGroup(group, spec.nodes.filter((node) => node.group === group.id), laneMode, radialMode));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const edges: LayoutEdge[] = spec.edges.map((edge) => {
    const from = nodeMap.get(edge.from)!;
    const to = nodeMap.get(edge.to)!;
    const fallback = groupMap.get(from.group)?.color ?? spec.theme.ink;
    return { ...edge, color: edge.color ?? fallback, path: connectionPath(from.box, to.box, `${edge.from}-${edge.to}`, edge.kind === "feedback") };
  });
  return { spec, groups, nodes, edges };
}
