import { z } from "zod";
import type { AtlasSpec } from "./types.js";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "颜色必须使用 #RRGGBB 格式");

const canvasSchema = z.object({
  width: z.number().int().min(800).max(3840).default(1600),
  height: z.number().int().min(600).max(2160).default(900),
  fps: z.number().int().min(5).max(30).default(20),
  frames: z.number().int().min(8).max(120).default(40),
});

const themeSchema = z.object({
  name: z.string().default("paper-color"),
  paper: color.default("#F6EEDD"),
  ink: color.default("#243B56"),
  mutedInk: color.default("#5F625E"),
  palette: z.array(color).min(2).max(12).default(["#CC654B", "#2D8585", "#3569A7", "#C18A37", "#7567A2"]),
  titleFont: z.string().default("STKaiti, KaiTi, serif"),
  bodyFont: z.string().default("STKaiti, KaiTi, Microsoft YaHei, Noto Sans CJK SC, serif"),
  texture: z.number().min(0).max(1).default(0.52),
  handDrawn: z.number().min(0).max(1).default(0.88),
});

const groupSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  note: z.string().optional(),
  color: color.optional(),
});

const iconSchema = z.enum(["chat", "calendar", "voice", "document", "target", "plan", "route", "shield", "browser", "knowledge", "code", "media", "report", "message", "dashboard", "archive", "memory"]);

const nodeSchema = z.object({
  id: z.string().min(1),
  group: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  icon: iconSchema.optional(),
  color: color.optional(),
});

const edgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  color: color.optional(),
  animated: z.boolean().default(true),
  kind: z.enum(["signal", "task", "result", "feedback"]).default("signal"),
});

export const atlasSpecSchema = z.object({
  $schema: z.string().optional(),
  meta: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    language: z.string().default("zh-CN"),
  }),
  canvas: canvasSchema.default({ width: 1600, height: 900, fps: 20, frames: 40 }),
  layout: z.object({
    mode: z.enum(["layered", "lanes", "radial"]).default("layered"),
    direction: z.enum(["horizontal", "vertical"]).default("horizontal"),
    profile: z.enum(["adaptive", "atlas-showcase"]).default("adaptive"),
  }).default({ mode: "layered", direction: "horizontal" }),
  theme: themeSchema.default({}),
  groups: z.array(groupSchema).min(2).max(8),
  nodes: z.array(nodeSchema).min(2).max(64),
  edges: z.array(edgeSchema).max(160).default([]),
  notes: z.array(z.object({
    text: z.string().min(1),
    anchor: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
    color: color.optional(),
  })).max(12).optional(),
}).superRefine((spec, ctx) => {
  const groupIds = new Set<string>();
  for (const [index, group] of spec.groups.entries()) {
    if (groupIds.has(group.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["groups", index, "id"], message: `分区 id 重复: ${group.id}` });
    groupIds.add(group.id);
  }
  const nodeIds = new Set<string>();
  for (const [index, node] of spec.nodes.entries()) {
    if (nodeIds.has(node.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "id"], message: `节点 id 重复: ${node.id}` });
    if (!groupIds.has(node.group)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "group"], message: `节点引用了不存在的分区: ${node.group}` });
    nodeIds.add(node.id);
  }
  for (const [index, edge] of spec.edges.entries()) {
    if (!nodeIds.has(edge.from)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", index, "from"], message: `连线起点不存在: ${edge.from}` });
    if (!nodeIds.has(edge.to)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", index, "to"], message: `连线终点不存在: ${edge.to}` });
  }
});

export function parseAtlasSpec(input: unknown): AtlasSpec {
  return atlasSpecSchema.parse(input) as AtlasSpec;
}

export function formatValidationError(error: unknown): string {
  if (!(error instanceof z.ZodError)) return error instanceof Error ? error.message : String(error);
  return error.issues.map((issue) => `${issue.path.join(".") || "spec"}: ${issue.message}`).join("\n");
}
