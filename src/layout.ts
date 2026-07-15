import type { AtlasGroup, AtlasNode, Box, LayoutEdge, LayoutGroup, LayoutNode, Scene, AtlasSpec } from "./types.js";

function groupColor(spec: AtlasSpec, group: AtlasGroup, index: number): string {
  return group.color ?? spec.theme.palette[index % spec.theme.palette.length];
}

function inset(box: Box, left: number, top: number, right = left, bottom = top): Box {
  return { x: box.x + left, y: box.y + top, width: box.width - left - right, height: box.height - top - bottom };
}

function layeredGroups(spec: AtlasSpec): LayoutGroup[] {
  if (spec.layout.profile === "atlas-showcase" && spec.groups.length === 4 && spec.canvas.width >= 1200 && spec.canvas.height >= 760) {
    const scaleX = spec.canvas.width / 1674;
    const scaleY = spec.canvas.height / 941;
    const blueprint = [
      { x: 80, y: 260, width: 245, height: 430 },
      { x: 500, y: 154, width: 300, height: 560 },
      { x: 895, y: 112, width: 310, height: 610 },
      { x: 1340, y: 232, width: 270, height: 470 },
    ];
    return spec.groups.map((group, index) => ({
      ...group,
      index,
      color: groupColor(spec, group, index),
      box: {
        x: blueprint[index].x * scaleX,
        y: blueprint[index].y * scaleY,
        width: blueprint[index].width * scaleX,
        height: blueprint[index].height * scaleY,
      },
    }));
  }
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
  const boxWidth = Math.min(340, Math.max(210, spec.canvas.width * (count > 6 ? 0.17 : count > 4 ? 0.2 : 0.22)));
  const boxHeight = Math.min(238, Math.max(148, (spec.canvas.height - 226) / Math.max(2.8, Math.ceil(count / 2))));
  const rx = Math.max(boxWidth * 0.92, spec.canvas.width / 2 - boxWidth / 2 - 66);
  const ry = Math.max(boxHeight * 0.7, spec.canvas.height / 2 - boxHeight / 2 - 104);
  const result = spec.groups.map((group, index) => {
    const angle = -Math.PI * 0.75 + (Math.PI * 2 * index) / count;
    const x = Math.max(32, Math.min(spec.canvas.width - boxWidth - 32, cx + Math.cos(angle) * rx - boxWidth / 2));
    const y = Math.max(150, Math.min(spec.canvas.height - boxHeight - 42, cy + Math.sin(angle) * ry - boxHeight / 2));
    return { ...group, index, color: groupColor(spec, group, index), box: { x, y, width: boxWidth, height: boxHeight } };
  });

  // Radial labels are placed on an ellipse and then gently repelled. This keeps
  // dense 5-8 group diagrams readable without giving up the radial silhouette.
  for (let pass = 0; pass < 80; pass += 1) {
    for (let left = 0; left < result.length; left += 1) {
      for (let right = left + 1; right < result.length; right += 1) {
        const a = result[left].box;
        const b = result[right].box;
        const overlapX = Math.min(a.x + a.width + 14, b.x + b.width + 14) - Math.max(a.x - 14, b.x - 14);
        const overlapY = Math.min(a.y + a.height + 14, b.y + b.height + 14) - Math.max(a.y - 14, b.y - 14);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (overlapX < overlapY) {
          const shift = overlapX / 2 + 0.5;
          const direction = a.x + a.width / 2 < b.x + b.width / 2 ? -1 : 1;
          a.x += direction * shift;
          b.x -= direction * shift;
        } else {
          const shift = overlapY / 2 + 0.5;
          const direction = a.y + a.height / 2 < b.y + b.height / 2 ? -1 : 1;
          a.y += direction * shift;
          b.y -= direction * shift;
        }
        a.x = Math.max(32, Math.min(spec.canvas.width - a.width - 32, a.x));
        b.x = Math.max(32, Math.min(spec.canvas.width - b.width - 32, b.x));
        a.y = Math.max(150, Math.min(spec.canvas.height - a.height - 42, a.y));
        b.y = Math.max(150, Math.min(spec.canvas.height - b.height - 42, b.y));
      }
    }
  }
  return result;
}

function layoutNodesInGroup(group: LayoutGroup, nodes: AtlasNode[], laneMode: boolean, radialMode: boolean, showcaseMode: boolean): LayoutNode[] {
  if (showcaseMode && nodes.length <= 4) {
    const presets = [
      { left: 18, top: 62, width: 215, height: 72, step: 88 },
      { left: 40, top: 82, width: 210, height: 90, step: 112 },
      { left: 30, top: 70, width: 230, height: 95, step: 135 },
      { left: 30, top: 60, width: 220, height: 72, step: 100 },
    ][group.index];
    return nodes.map((node, index) => ({
      ...node,
      box: {
        x: group.box.x + presets.left,
        y: group.box.y + presets.top + index * presets.step,
        width: presets.width,
        height: presets.height,
      },
    }));
  }
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

type Point = [number, number];

function anchor(box: Box, side: "left" | "right" | "top" | "bottom"): Point {
  if (side === "left") return [box.x, box.y + box.height / 2];
  if (side === "right") return [box.x + box.width, box.y + box.height / 2];
  if (side === "top") return [box.x + box.width / 2, box.y];
  return [box.x + box.width / 2, box.y + box.height];
}

function compactPath(points: Point[]): Point[] {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point[0] - previous[0]) > 0.1 || Math.abs(point[1] - previous[1]) > 0.1;
  }).filter((point, index, all) => {
    if (index === 0 || index === all.length - 1) return true;
    const previous = all[index - 1];
    const next = all[index + 1];
    return !((previous[0] === point[0] && point[0] === next[0]) || (previous[1] === point[1] && point[1] === next[1]));
  });
}

function pointInside(point: Point, box: Box, padding = 0): boolean {
  return point[0] > box.x - padding && point[0] < box.x + box.width + padding && point[1] > box.y - padding && point[1] < box.y + box.height + padding;
}

function pathScore(path: Point[], obstacles: Box[], previous: Point[][], width: number, height: number): number {
  let score = 0;
  for (let segment = 1; segment < path.length; segment += 1) {
    const a = path[segment - 1];
    const b = path[segment];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    score += length;
    const samples = Math.max(2, Math.ceil(length / 8));
    for (let index = 1; index < samples; index += 1) {
      const t = index / samples;
      const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (point[0] < 18 || point[0] > width - 18 || point[1] < 142 || point[1] > height - 24) score += 12_000;
      for (const obstacle of obstacles) if (pointInside(point, obstacle, 10)) score += 40_000;
      for (const used of previous) {
        for (let usedSegment = 1; usedSegment < used.length; usedSegment += 1) {
          const u = used[usedSegment - 1];
          const v = used[usedSegment];
          const minX = Math.min(u[0], v[0]) - 5;
          const maxX = Math.max(u[0], v[0]) + 5;
          const minY = Math.min(u[1], v[1]) - 5;
          const maxY = Math.max(u[1], v[1]) + 5;
          if (point[0] >= minX && point[0] <= maxX && point[1] >= minY && point[1] <= maxY) score += 14;
        }
      }
    }
  }
  score += Math.max(0, path.length - 2) * 18;
  return score;
}

function connectionPath(from: Box, to: Box, key: string, obstacles: Box[], previous: Point[][], canvas: Box, feedback = false): Point[] {
  const fromCenter: Point = [from.x + from.width / 2, from.y + from.height / 2];
  const toCenter: Point = [to.x + to.width / 2, to.y + to.height / 2];
  const wave = seedWave(key, 16);
  const candidates: Point[][] = [];
  const horizontal = (corridorX: number): Point[] => {
    const start = anchor(from, corridorX >= fromCenter[0] ? "right" : "left");
    const end = anchor(to, corridorX >= toCenter[0] ? "right" : "left");
    return compactPath([start, [corridorX, start[1]], [corridorX, end[1]], end]);
  };
  const vertical = (corridorY: number): Point[] => {
    const start = anchor(from, corridorY >= fromCenter[1] ? "bottom" : "top");
    const end = anchor(to, corridorY >= toCenter[1] ? "bottom" : "top");
    return compactPath([start, [start[0], corridorY], [end[0], corridorY], end]);
  };
  const lead = (box: Box, side: "left" | "right" | "top" | "bottom", distance = 14): Point => {
    const point = anchor(box, side);
    if (side === "left") return [point[0] - distance, point[1]];
    if (side === "right") return [point[0] + distance, point[1]];
    if (side === "top") return [point[0], point[1] - distance];
    return [point[0], point[1] + distance];
  };

  const midpointX = (fromCenter[0] + toCenter[0]) / 2;
  const midpointY = (fromCenter[1] + toCenter[1]) / 2;
  for (const offset of [0, wave, -wave, 34, -34, 68, -68]) {
    candidates.push(horizontal(midpointX + offset));
    candidates.push(vertical(midpointY + offset));
  }
  const leftX = Math.max(28, Math.min(from.x, to.x) - 30 - Math.abs(wave));
  const rightX = Math.min(canvas.width - 28, Math.max(from.x + from.width, to.x + to.width) + 30 + Math.abs(wave));
  const topY = Math.max(146, Math.min(from.y, to.y) - 28 - Math.abs(wave));
  const bottomY = Math.min(canvas.height - 30, Math.max(from.y + from.height, to.y + to.height) + 28 + Math.abs(wave));
  const nearLeftX = Math.max(22, Math.min(from.x, to.x) - 12);
  const nearRightX = Math.min(canvas.width - 22, Math.max(from.x + from.width, to.x + to.width) + 12);
  const nearTopY = Math.max(144, Math.min(from.y, to.y) - 12);
  const nearBottomY = Math.min(canvas.height - 24, Math.max(from.y + from.height, to.y + to.height) + 12);
  candidates.push(horizontal(leftX), horizontal(rightX), horizontal(nearLeftX), horizontal(nearRightX), vertical(topY), vertical(bottomY), vertical(nearTopY), vertical(nearBottomY));

  const corridorYs = [topY, bottomY, nearTopY, nearBottomY, 148, canvas.height - 28, ...obstacles.flatMap((box) => [box.y - 12, box.y + box.height + 12])]
    .filter((value, index, all) => value >= 144 && value <= canvas.height - 24 && all.findIndex((item) => Math.abs(item - value) < 1) === index)
    .sort((a, b) => {
      const occupied = (value: number) => obstacles.filter((box) => value > box.y - 10 && value < box.y + box.height + 10).length;
      return occupied(a) * 100_000 + Math.abs(a - midpointY) - occupied(b) * 100_000 - Math.abs(b - midpointY);
    }).slice(0, 6);
  const corridorXs = [leftX, rightX, nearLeftX, nearRightX, 24, canvas.width - 24, ...obstacles.flatMap((box) => [box.x - 12, box.x + box.width + 12])]
    .filter((value, index, all) => value >= 20 && value <= canvas.width - 20 && all.findIndex((item) => Math.abs(item - value) < 1) === index)
    .sort((a, b) => {
      const occupied = (value: number) => obstacles.filter((box) => value > box.x - 10 && value < box.x + box.width + 10).length;
      return occupied(a) * 100_000 + Math.abs(a - midpointX) - occupied(b) * 100_000 - Math.abs(b - midpointX);
    }).slice(0, 6);
  for (const corridorY of corridorYs) {
    for (const startSide of ["left", "right"] as const) {
      for (const endSide of ["left", "right"] as const) {
        const start = anchor(from, startSide);
        const startLead = lead(from, startSide);
        const end = anchor(to, endSide);
        const endLead = lead(to, endSide);
        candidates.push(compactPath([start, startLead, [startLead[0], corridorY], [endLead[0], corridorY], endLead, end]));
      }
    }
  }
  for (const corridorX of corridorXs) {
    for (const startSide of ["top", "bottom"] as const) {
      for (const endSide of ["top", "bottom"] as const) {
        const start = anchor(from, startSide);
        const startLead = lead(from, startSide);
        const end = anchor(to, endSide);
        const endLead = lead(to, endSide);
        candidates.push(compactPath([start, startLead, [corridorX, startLead[1]], [corridorX, endLead[1]], endLead, end]));
      }
    }
  }
  for (const outerX of [leftX, rightX]) {
    for (const outerY of [topY, bottomY]) {
      const startSide = outerX >= fromCenter[0] ? "right" : "left";
      const endSide = outerY >= toCenter[1] ? "bottom" : "top";
      const start = anchor(from, startSide);
      const end = anchor(to, endSide);
      candidates.push(compactPath([start, [outerX, start[1]], [outerX, outerY], [end[0], outerY], end]));

      const alternateStartSide = outerY >= fromCenter[1] ? "bottom" : "top";
      const alternateEndSide = outerX >= toCenter[0] ? "right" : "left";
      const alternateStart = anchor(from, alternateStartSide);
      const alternateEnd = anchor(to, alternateEndSide);
      candidates.push(compactPath([alternateStart, [alternateStart[0], outerY], [outerX, outerY], [outerX, alternateEnd[1]], alternateEnd]));
    }
  }

  if (feedback) {
    // Feedback loops should visibly leave the normal forward-flow corridor.
    const preferred = fromCenter[0] + toCenter[0] < canvas.width ? horizontal(leftX) : horizontal(rightX);
    candidates.unshift(preferred);
  }
  return candidates.map(compactPath).sort((a, b) => pathScore(a, obstacles, previous, canvas.width, canvas.height) - pathScore(b, obstacles, previous, canvas.width, canvas.height))[0];
}

function atlasFlowPath(from: Box, to: Box, fromGroup: LayoutGroup, toGroup: LayoutGroup, key: string, canvas: Box): Point[] | undefined {
  if (fromGroup.index === 1 && toGroup.index === 1 && to.y > from.y) {
    return [anchor(from, "bottom"), anchor(to, "top")];
  }
  if (toGroup.index !== fromGroup.index + 1) return undefined;
  const start = anchor(from, "right");
  const end = anchor(to, "left");
  const gap = toGroup.box.x - (fromGroup.box.x + fromGroup.box.width);
  if (gap < 34) return undefined;
  const wave = seedWave(key, 13);
  if (fromGroup.index === 0 || fromGroup.index === 2) {
    const hub: Point = fromGroup.index === 0
      ? [canvas.width * (485 / 1674), canvas.height * (459 / 941)]
      : [canvas.width * (1315 / 1674), canvas.height * (443 / 941)];
    return compactPath([
      start,
      [start[0] + 20, start[1]],
      [hub[0] - 38 + wave, start[1] + (hub[1] - start[1]) * 0.72],
      hub,
      [hub[0] + 38 + wave * 0.4, end[1] + (hub[1] - end[1]) * 0.72],
      [end[0] - 20, end[1]],
      end,
    ]);
  }
  const middleX = start[0] + gap / 2;
  return compactPath([
    start,
    [start[0] + gap * 0.28, start[1]],
    [middleX + wave, (start[1] + end[1]) / 2 + wave * 0.55],
    [end[0] - gap * 0.28, end[1]],
    end,
  ]);
}

export function buildScene(spec: AtlasSpec): Scene {
  const laneMode = spec.layout.mode === "lanes" || spec.layout.direction === "vertical";
  const radialMode = spec.layout.mode === "radial";
  const showcaseMode = spec.layout.profile === "atlas-showcase" && spec.layout.mode === "layered";
  const groups = radialMode ? radialGroups(spec) : laneMode ? laneGroups(spec) : layeredGroups(spec);
  const nodes = groups.flatMap((group) => layoutNodesInGroup(group, spec.nodes.filter((node) => node.group === group.id), laneMode, radialMode, showcaseMode));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const routed: Point[][] = [];
  const edges: LayoutEdge[] = spec.edges.map((edge) => {
    const from = nodeMap.get(edge.from)!;
    const to = nodeMap.get(edge.to)!;
    const fromGroup = groupMap.get(from.group)!;
    const toGroup = groupMap.get(to.group)!;
    const nodeIndex = nodes.filter((node) => node.group === from.group).findIndex((node) => node.id === from.id);
    let fallback = fromGroup.color ?? spec.theme.ink;
    if (fromGroup.index === 0 && toGroup.index === 1) fallback = spec.theme.palette[0] ?? fallback;
    else if (fromGroup.index === 1 && toGroup.index === 2) fallback = spec.theme.palette[nodeIndex % 2 === 0 ? 1 : 2] ?? fallback;
    else if (fromGroup.index === 2 && toGroup.index === 3) fallback = spec.theme.palette[nodeIndex === 3 ? 3 : 4] ?? fallback;
    else if (edge.kind === "feedback") fallback = spec.theme.palette[1] ?? fallback;
    const obstacles = [
      ...nodes.filter((node) => node.id !== from.id && node.id !== to.id).map((node) => node.box),
      ...groups.map((group) => ({ x: group.box.x, y: group.box.y, width: laneMode ? Math.min(400, group.box.width) : group.box.width, height: Math.min(68, group.box.height) })),
      { x: 42, y: 20, width: Math.min(520, spec.canvas.width * 0.5), height: 116 },
    ];
    const canvas = { x: 0, y: 0, width: spec.canvas.width, height: spec.canvas.height };
    const authoredFlow = showcaseMode && edge.kind !== "feedback"
      ? atlasFlowPath(from.box, to.box, fromGroup, toGroup, `${edge.from}-${edge.to}`, canvas)
      : undefined;
    const path = authoredFlow ?? connectionPath(from.box, to.box, `${edge.from}-${edge.to}`, obstacles, routed, canvas, edge.kind === "feedback");
    routed.push(path);
    return { ...edge, color: edge.color ?? fallback, path };
  });
  return { spec, groups, nodes, edges };
}
