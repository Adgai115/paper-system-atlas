import path from "node:path";
import type { AtlasSpec, LayoutMode } from "./types.js";
import { buildScene } from "./layout.js";
import { analyzeSceneQuality } from "./exporters.js";

interface CandidateReport {
  layout: LayoutMode;
  score: number;
  blockingIssues: string[];
  warnings: string[];
  averageRouteRatio: number;
}

export interface AtlasPlan {
  ok: true;
  source: "spec" | "document";
  recommendation: {
    layout: LayoutMode;
    profile: "adaptive" | "atlas-showcase";
    theme: "paper-color" | "blueprint" | "whiteboard" | "ink-wash";
    canvas: "presentation" | "article" | "wechat" | "square" | "print-a4";
    formats: string[];
    rationale: string[];
  };
  signals: Record<string, unknown>;
  candidates?: CandidateReport[];
  risks: Array<{ code: string; message: string }>;
  nextCommand?: string;
}

function routeLength(path: [number, number][]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
  return total;
}

function planCandidate(spec: AtlasSpec, layout: LayoutMode): CandidateReport {
  const candidate = structuredClone(spec);
  candidate.layout.mode = layout;
  candidate.layout.direction = layout === "lanes" ? "vertical" : "horizontal";
  if (layout !== "layered" || candidate.groups.length !== 4) candidate.layout.profile = "adaptive";
  const scene = buildScene(candidate);
  const quality = analyzeSceneQuality(scene);
  const blockingIssues = quality.checks.filter((item) => !item.ok).map((item) => item.name);
  const warnings = quality.warnings.filter((item) => !item.ok).map((item) => item.name);
  const diagonal = Math.hypot(spec.canvas.width, spec.canvas.height);
  const averageRouteRatio = scene.edges.length ? scene.edges.reduce((sum, edge) => sum + routeLength(edge.path), 0) / scene.edges.length / diagonal : 0;
  let score = blockingIssues.length * 100 + warnings.length * 10 + averageRouteRatio * 8;
  const feedbackRatio = spec.edges.filter((edge) => edge.kind === "feedback").length / Math.max(1, spec.edges.length);
  if (layout === "radial" && feedbackRatio >= 0.16) score -= 12;
  if (layout === "layered" && spec.groups.length === 4) score -= 7;
  if (layout === "lanes" && spec.groups.length >= 3 && spec.groups.length <= 6) score -= 3;
  return { layout, score: Number(score.toFixed(3)), blockingIssues, warnings, averageRouteRatio: Number(averageRouteRatio.toFixed(3)) };
}

function contentTheme(text: string, nodeCount: number): AtlasPlan["recommendation"]["theme"] {
  if (/工程|架构|接口|API|协议|网络|部署|代码/i.test(text) && nodeCount <= 28) return "blueprint";
  if (/复盘|会议|协作|头脑风暴|白板/.test(text)) return "whiteboard";
  if (/文化|历史|人文|理念|战略/.test(text)) return "ink-wash";
  return "paper-color";
}

function sourceBasename(sourceName: string): string {
  if (sourceName === "-") return "stdin-map";
  return path.parse(sourceName).name.replace(/[^a-zA-Z0-9_-]+/g, "-") || "system-map";
}

export function planSpec(spec: AtlasSpec, sourceName = "atlas-spec.json"): AtlasPlan {
  const candidates = (["layered", "lanes", "radial"] as LayoutMode[]).map((layout) => planCandidate(spec, layout)).sort((left, right) => left.score - right.score);
  const best = candidates[0];
  const feedbackEdges = spec.edges.filter((edge) => edge.kind === "feedback").length;
  const animatedEdges = spec.edges.filter((edge) => edge.animated !== false).length;
  const content = [spec.meta.title, spec.meta.subtitle, spec.meta.description, ...spec.groups.map((group) => `${group.title} ${group.note ?? ""}`), ...spec.nodes.map((node) => `${node.title} ${node.description ?? ""}`)].filter(Boolean).join(" ");
  const profile = best.layout === "layered" && spec.groups.length === 4 && spec.nodes.length >= 8 && spec.nodes.length <= 16 ? "atlas-showcase" : "adaptive";
  const theme = contentTheme(content, spec.nodes.length);
  const canvas = best.layout === "radial" || spec.nodes.length > 20 ? "article" : "presentation";
  const formats = ["svg", "png", "excalidraw"];
  if (animatedEdges > 0 && feedbackEdges > 0) formats.push("gif");
  const rationale = [
    `${best.layout} 在三种候选布局中的综合评分最低（${best.score}）`,
    profile === "atlas-showcase" ? "四分区且节点数量适合高保真展示模板" : "内容规模或布局类型更适合自适应配置",
    canvas === "article" ? "径向或高密度内容需要更高的垂直空间" : "当前内容规模适合标准演示画布",
  ];
  if (feedbackEdges > 0) rationale.push(`检测到 ${feedbackEdges} 条反馈边，保留动态闭环输出`);
  const risks: AtlasPlan["risks"] = [];
  for (const issue of best.blockingIssues) risks.push({ code: issue, message: `推荐布局存在结构问题：${issue}` });
  for (const warning of best.warnings) risks.push({ code: warning, message: `推荐布局需要复查：${warning}` });
  const basename = sourceBasename(sourceName);
  return {
    ok: true,
    source: "spec",
    recommendation: { layout: best.layout, profile, theme, canvas, formats, rationale },
    signals: {
      groups: spec.groups.length,
      nodes: spec.nodes.length,
      edges: spec.edges.length,
      feedbackEdges,
      animatedEdges,
    },
    candidates,
    risks,
    nextCommand: `paper-atlas render --spec "${sourceName}" --outdir outputs --basename "${basename}" --layout ${best.layout} --theme ${theme} --canvas ${canvas} --formats ${formats.join(",")} --verify`,
  };
}

export function planDocument(document: string, sourceName = "document.md"): AtlasPlan {
  const text = document.trim();
  if (text.length < 20) throw new Error("输入文档内容过短，无法制定图谱计划");
  const loopHits = (text.match(/闭环|反馈|循环|重试|学习|迭代/g) ?? []).length;
  const laneHits = (text.match(/角色|部门|团队|泳道|职责|交接|审批/g) ?? []).length;
  const architectureHits = (text.match(/架构|模块|能力|系统|输入|处理|输出|交付/g) ?? []).length;
  const layout: LayoutMode = loopHits >= 2 ? "radial" : laneHits >= 2 ? "lanes" : "layered";
  const theme = contentTheme(text, 0);
  const canvas = layout === "radial" || text.length > 6000 ? "article" : "presentation";
  const rationale = [
    layout === "radial" ? `检测到 ${loopHits} 个闭环或反馈信号` : layout === "lanes" ? `检测到 ${laneHits} 个角色或职责信号` : `检测到 ${architectureHits} 个架构或阶段信号`,
    "文档尚未编排为规格，最终布局应在 compose 后通过 preview 复核",
  ];
  const basename = sourceBasename(sourceName);
  return {
    ok: true,
    source: "document",
    recommendation: { layout, profile: layout === "layered" ? "atlas-showcase" : "adaptive", theme, canvas, formats: ["svg", "png", "excalidraw"], rationale },
    signals: { characters: text.length, loopHits, laneHits, architectureHits },
    risks: [{ code: "semantic_spec_pending", message: "尚未生成语义规格，节点密度与连线路由风险未知" }],
    nextCommand: `paper-atlas compose --input "${sourceName}" --profile ${layout === "layered" ? "atlas-showcase" : "adaptive"} --outdir outputs --basename "${basename}" --theme ${theme} --canvas ${canvas} --formats svg,png,excalidraw`,
  };
}
