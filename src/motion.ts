import type { Box, LayoutEdge, Scene } from "./types.js";

export type Rgba = readonly [number, number, number, number];

export function pointAlongPath(edge: LayoutEdge, progress: number): [number, number] {
  const lengths = edge.path.slice(1).map((point, index) => Math.hypot(point[0] - edge.path[index][0], point[1] - edge.path[index][1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let distance = Math.max(0, Math.min(1, progress)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (distance <= lengths[index] || index === lengths.length - 1) {
      const ratio = lengths[index] ? distance / lengths[index] : 0;
      const from = edge.path[index];
      const to = edge.path[index + 1];
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
    }
    distance -= lengths[index];
  }
  return edge.path[edge.path.length - 1];
}

function parseColor(value: string): Rgba {
  const normalized = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return [
      Number.parseInt(normalized[1] + normalized[1], 16),
      Number.parseInt(normalized[2] + normalized[2], 16),
      Number.parseInt(normalized[3] + normalized[3], 16),
      255,
    ];
  }
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return [
      Number.parseInt(normalized.slice(1, 3), 16),
      Number.parseInt(normalized.slice(3, 5), 16),
      Number.parseInt(normalized.slice(5, 7), 16),
      255,
    ];
  }
  return [36, 59, 86, 255];
}

function blendPixel(pixels: Uint8Array, width: number, height: number, x: number, y: number, color: Rgba, opacity: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height || opacity <= 0) return;
  const offset = (py * width + px) * 4;
  const alpha = Math.max(0, Math.min(1, opacity * color[3] / 255));
  pixels[offset] = Math.round(pixels[offset] * (1 - alpha) + color[0] * alpha);
  pixels[offset + 1] = Math.round(pixels[offset + 1] * (1 - alpha) + color[1] * alpha);
  pixels[offset + 2] = Math.round(pixels[offset + 2] * (1 - alpha) + color[2] * alpha);
  pixels[offset + 3] = 255;
}

function paintDisc(pixels: Uint8Array, width: number, height: number, x: number, y: number, radius: number, color: Rgba, opacity: number): void {
  const extent = Math.ceil(radius);
  const inner = radius * 0.48;
  for (let dy = -extent; dy <= extent; dy += 1) {
    for (let dx = -extent; dx <= extent; dx += 1) {
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      const feather = distance <= inner ? 1 : 1 - (distance - inner) / Math.max(0.01, radius - inner);
      blendPixel(pixels, width, height, x + dx, y + dy, color, opacity * feather);
    }
  }
}

function roundedRectDistance(x: number, y: number, box: Box, radius: number): number {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const qx = Math.abs(x - cx) - Math.max(0, box.width / 2 - radius);
  const qy = Math.abs(y - cy) - Math.max(0, box.height / 2 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function paintPulse(pixels: Uint8Array, width: number, height: number, box: Box, color: Rgba, strength: number): void {
  const expansion = 4 + 4 * strength;
  const pulseBox = { x: box.x - expansion, y: box.y - expansion, width: box.width + expansion * 2, height: box.height + expansion * 2 };
  const minX = Math.max(0, Math.floor(pulseBox.x - 3));
  const maxX = Math.min(width - 1, Math.ceil(pulseBox.x + pulseBox.width + 3));
  const minY = Math.max(0, Math.floor(pulseBox.y - 3));
  const maxY = Math.min(height - 1, Math.ceil(pulseBox.y + pulseBox.height + 3));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.abs(roundedRectDistance(x, y, pulseBox, 18));
      if (distance > 2.6) continue;
      blendPixel(pixels, width, height, x, y, color, strength * 0.34 * (1 - distance / 2.6));
    }
  }
}

function wrapProgress(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function paintMotionFrame(scene: Scene, basePixels: Uint8Array, progress: number): Uint8Array {
  const { width, height } = scene.spec.canvas;
  const pixels = new Uint8Array(basePixels);
  const nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
  const trails = [
    { lag: 0.065, radius: 2.2, opacity: 0.24 },
    { lag: 0.042, radius: 2.7, opacity: 0.34 },
    { lag: 0.021, radius: 3.2, opacity: 0.48 },
  ];

  scene.edges.forEach((edge, index) => {
    if (!edge.animated) return;
    const phase = wrapProgress(progress + index * 0.113);
    const color = parseColor(edge.color);
    for (const trail of trails) {
      const point = pointAlongPath(edge, wrapProgress(phase - trail.lag));
      paintDisc(pixels, width, height, point[0], point[1], trail.radius, color, trail.opacity);
    }
    const point = pointAlongPath(edge, phase);
    paintDisc(pixels, width, height, point[0], point[1], 9.5, color, 0.16);
    paintDisc(pixels, width, height, point[0], point[1], 4.2, color, 0.96);
    paintDisc(pixels, width, height, point[0] - 1.1, point[1] - 1.2, 1.25, [255, 250, 233, 255], 0.78);

    if (phase >= 0.79) {
      const node = nodeById.get(edge.to);
      if (node) paintPulse(pixels, width, height, node.box, color, Math.sin(((phase - 0.79) / 0.21) * Math.PI));
    }
  });
  return pixels;
}
