import { z } from "zod";
import { formatValidationError, parseAtlasSpec } from "./schema.js";
import type { AtlasSpec, LayoutMode } from "./types.js";

export type ComposerProfile = "atlas-showcase" | "adaptive";
export type ApiStyle = "responses" | "chat-completions";

const icons = ["chat", "calendar", "voice", "document", "target", "plan", "route", "shield", "browser", "knowledge", "code", "media", "report", "message", "dashboard", "archive", "memory"] as const;
const palette = ["#B04A37", "#1E7772", "#3569A7", "#906314", "#705B98"];

const semanticSchema = z.object({
  meta: z.object({
    title: z.string().min(1).max(18),
    subtitle: z.string().min(1).max(42),
    description: z.string().min(1).max(80),
  }).strict(),
  layout: z.object({ mode: z.enum(["layered", "lanes", "radial"]) }).strict(),
  groups: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    title: z.string().min(1).max(10),
    note: z.string().min(1).max(28),
  }).strict()).min(2).max(8),
  nodes: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    group: z.string().min(1),
    title: z.string().min(1).max(12),
    description: z.string().min(1).max(38),
    icon: z.enum(icons),
  }).strict()).min(2).max(48),
  edges: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().min(1).max(18).nullable().optional(),
    kind: z.enum(["signal", "task", "result", "feedback"]),
    animated: z.boolean(),
  }).strict()).min(1).max(120),
  notes: z.array(z.object({
    text: z.string().min(1).max(48),
    anchor: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
  }).strict()).min(1).max(4),
}).strict().superRefine((semantic, ctx) => {
  const groupIds = new Set<string>();
  for (const [index, group] of semantic.groups.entries()) {
    if (groupIds.has(group.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["groups", index, "id"], message: `分区 id 重复: ${group.id}` });
    groupIds.add(group.id);
  }
  const nodeIds = new Set<string>();
  for (const [index, node] of semantic.nodes.entries()) {
    if (nodeIds.has(node.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "id"], message: `节点 id 重复: ${node.id}` });
    if (!groupIds.has(node.group)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "group"], message: `节点引用了不存在的分区: ${node.group}` });
    nodeIds.add(node.id);
  }
  for (const [index, edge] of semantic.edges.entries()) {
    if (!nodeIds.has(edge.from)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", index, "from"], message: `连线起点不存在: ${edge.from}` });
    if (!nodeIds.has(edge.to)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", index, "to"], message: `连线终点不存在: ${edge.to}` });
    if (edge.from === edge.to) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", index], message: "连线不能指向自身" });
  }
});

type SemanticSpec = z.infer<typeof semanticSchema>;

export interface ModelRequest {
  instructions: string;
  input: string;
  jsonSchema: Record<string, unknown>;
}

export interface TextModelClient {
  readonly provider: string;
  readonly model: string;
  generate(request: ModelRequest): Promise<string>;
}

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  apiStyle?: ApiStyle;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (delayMs: number) => Promise<void>;
}

export interface ComposeRequest {
  document: string;
  profile: ComposerProfile;
  client: TextModelClient;
  maxAttempts?: number;
}

export interface ComposeResult {
  spec: AtlasSpec;
  attempts: number;
  provider: string;
  model: string;
}

function strictObject(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) };
}

export function semanticJsonSchema(profile: ComposerProfile): Record<string, unknown> {
  const groupLimit = profile === "atlas-showcase" ? { minItems: 4, maxItems: 4 } : { minItems: 2, maxItems: 8 };
  return {
    ...strictObject({
      meta: strictObject({
        title: { type: "string", minLength: 1, maxLength: 18 },
        subtitle: { type: "string", minLength: 1, maxLength: 42 },
        description: { type: "string", minLength: 1, maxLength: 80 },
      }),
      layout: strictObject({
        mode: profile === "atlas-showcase" ? { type: "string", const: "layered" } : { type: "string", enum: ["layered", "lanes", "radial"] },
      }),
      groups: {
        type: "array",
        ...groupLimit,
        items: strictObject({
          id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,31}$" },
          title: { type: "string", minLength: 1, maxLength: 10 },
          note: { type: "string", minLength: 1, maxLength: 28 },
        }),
      },
      nodes: {
        type: "array", minItems: profile === "atlas-showcase" ? 8 : 2, maxItems: profile === "atlas-showcase" ? 16 : 48,
        items: strictObject({
          id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,31}$" },
          group: { type: "string" },
          title: { type: "string", minLength: 1, maxLength: 12 },
          description: { type: "string", minLength: 1, maxLength: 38 },
          icon: { type: "string", enum: [...icons] },
        }),
      },
      edges: {
        type: "array", minItems: 1, maxItems: 120,
        items: strictObject({
          from: { type: "string" }, to: { type: "string" },
          label: { anyOf: [{ type: "string", minLength: 1, maxLength: 18 }, { type: "null" }] },
          kind: { type: "string", enum: ["signal", "task", "result", "feedback"] },
          animated: { type: "boolean" },
        }),
      },
      notes: {
        type: "array", minItems: 1, maxItems: 4,
        items: strictObject({
          text: { type: "string", minLength: 1, maxLength: 48 },
          anchor: { type: "string", enum: ["top-left", "top-right", "bottom-left", "bottom-right"] },
        }),
      },
    }),
  };
}

function extractResponseText(payload: unknown): string {
  const data = payload as Record<string, unknown>;
  if (typeof data.output_text === "string") return data.output_text;
  if (Array.isArray(data.output)) {
    for (const item of data.output as Array<Record<string, unknown>>) {
      if (!Array.isArray(item.content)) continue;
      for (const part of item.content as Array<Record<string, unknown>>) {
        if (part.type === "output_text" && typeof part.text === "string") return part.text;
      }
    }
  }
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    const text = (message.content as Array<Record<string, unknown>>).find((part) => part.type === "text")?.text;
    if (typeof text === "string") return text;
  }
  throw new Error("模型响应中没有可解析的文本内容");
}

class ModelHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number | undefined, body: string) {
    super(`模型接口返回 HTTP ${status}: ${body.slice(0, 1200)}`);
    this.name = "ModelHttpError";
  }
}

const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1000);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.min(30_000, Math.max(0, timestamp - Date.now()));
}

function isRetryableRequestError(error: unknown): boolean {
  if (error instanceof ModelHttpError) return retryableStatuses.has(error.status);
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError" || error instanceof TypeError) return true;
  const code = "code" in error ? String((error as Error & { code?: unknown }).code) : "";
  return ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code);
}

function describeRequestError(error: unknown): string {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return "模型接口请求超时";
  return error instanceof Error ? error.message : String(error);
}

export function createOpenAICompatibleClient(config: OpenAICompatibleConfig): TextModelClient {
  const apiStyle = config.apiStyle ?? "responses";
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const requestFetch = config.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1, config.timeoutMs ?? 120_000);
  const maxRetries = Math.max(0, Math.min(5, config.maxRetries ?? 2));
  const retryDelayMs = Math.max(0, Math.min(30_000, config.retryDelayMs ?? 500));
  const sleep = config.sleepImpl ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  return {
    provider: `openai-compatible:${apiStyle}`,
    model: config.model,
    async generate(request): Promise<string> {
      const format = { type: "json_schema", name: "atlas_semantic_spec", strict: true, schema: request.jsonSchema };
      const body = apiStyle === "responses"
        ? { model: config.model, instructions: request.instructions, input: request.input, text: { format }, store: false }
        : {
            model: config.model,
            messages: [{ role: "system", content: request.instructions }, { role: "user", content: request.input }],
            response_format: { type: "json_schema", json_schema: { name: format.name, strict: format.strict, schema: format.schema } },
          };
      const endpoint = apiStyle === "responses" ? `${baseUrl}/responses` : `${baseUrl}/chat/completions`;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const response = await requestFetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });
          const responseBody = await response.text();
          if (!response.ok) throw new ModelHttpError(response.status, retryAfterMs(response.headers.get("retry-after")), responseBody);
          try { return extractResponseText(JSON.parse(responseBody)); }
          catch (error) { throw new Error(`无法解析模型响应: ${error instanceof Error ? error.message : String(error)}`); }
        } catch (error) {
          if (attempt >= maxRetries || !isRetryableRequestError(error)) {
            const attempts = attempt + 1;
            throw new Error(`模型接口请求失败（${attempts} 次尝试）：${describeRequestError(error)}`, { cause: error });
          }
          const retryAfter = error instanceof ModelHttpError ? error.retryAfterMs : undefined;
          const delay = retryAfter ?? Math.min(30_000, retryDelayMs * 2 ** attempt);
          if (delay > 0) await sleep(delay);
        }
      }
      throw new Error("模型接口请求失败");
    },
  };
}

function instructions(profile: ComposerProfile): string {
  const profileRules = profile === "atlas-showcase"
    ? "必须生成恰好 4 个语义分区，每区 2-4 个节点，优先每区 4 个节点；布局必须为 layered。按输入、处理、能力、交付的阅读顺序组织，但标题应忠于原文。"
    : "根据内容选择 layered、lanes 或 radial；使用 2-8 个分区。存在明显反馈闭环、中心平台或生态关系时优先 radial。";
  return `你是 Paper System Atlas 的中文系统图谱编排器。把文章、流程或系统说明提取为严格的语义 JSON，不输出解释或 Markdown。\n${profileRules}\n规则：\n1. 中文优先，仅保留必要英文缩写。\n2. 标题短而明确，节点描述控制在一行到两行。\n3. 只建立真实依赖，反馈边仅用于重试、学习、记忆或验证闭环。\n4. id 使用简短英文 kebab-case 且全局唯一。\n5. 所有节点必须属于已有分区，所有连线必须引用已有节点。\n6. animated 只为需要表达动态信号的边设为 true；分区内部静态顺序可设为 false。\n7. label 只在连线动作或传输内容需要解释时填写短语，否则设为 null。\n8. 不生成坐标、颜色、字体或画布尺寸，它们由引擎统一注入。`;
}

function parseModelJson(text: string): unknown {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON 对象");
  return JSON.parse(unfenced.slice(start, end + 1));
}

function assembleSpec(semantic: SemanticSpec, profile: ComposerProfile): AtlasSpec {
  const mode: LayoutMode = profile === "atlas-showcase" ? "layered" : semantic.layout.mode;
  const showcase = profile === "atlas-showcase";
  const groups = semantic.groups.map((group, index) => ({ ...group, color: palette[index % palette.length] }));
  return parseAtlasSpec({
    meta: { ...semantic.meta, language: "zh-CN" },
    canvas: { width: showcase ? 1674 : 1600, height: showcase ? 941 : mode === "radial" ? 1000 : 900, fps: 8, frames: 16 },
    layout: {
      mode,
      direction: mode === "lanes" ? "vertical" : "horizontal",
      profile,
      hub: mode === "radial" ? { title: semantic.meta.title, description: semantic.meta.subtitle, color: palette[1] } : undefined,
    },
    theme: {
      name: "paper-color", paper: "#F6EEDD", ink: "#243B56", mutedInk: "#5F625E", palette,
      titleFont: "STKaiti, KaiTi, serif", bodyFont: "STKaiti, KaiTi, Microsoft YaHei, Noto Sans CJK SC, serif",
      texture: 0.52, handDrawn: 0.9,
    },
    groups,
    nodes: semantic.nodes,
    edges: semantic.edges.map(({ label, ...edge }) => label ? { ...edge, label } : edge),
    notes: semantic.notes.map((note, index) => ({ ...note, color: palette[index % palette.length] })),
    decorations: showcase ? {
      principles: semantic.notes.map((note) => note.text).slice(0, 5),
      support: { title: "内容依据", description: semantic.meta.description },
      callouts: semantic.groups.map((group, index) => ({ group: group.id, text: group.note, color: palette[index % palette.length] })),
      compass: true,
      landscape: true,
    } : undefined,
  });
}

function validateForProfile(input: unknown, profile: ComposerProfile): SemanticSpec {
  const semantic = semanticSchema.parse(input);
  if (profile === "atlas-showcase") {
    if (semantic.groups.length !== 4) throw new Error("atlas-showcase 必须恰好包含 4 个分区");
    for (const group of semantic.groups) {
      const count = semantic.nodes.filter((node) => node.group === group.id).length;
      if (count < 2 || count > 4) throw new Error(`atlas-showcase 分区 ${group.id} 必须包含 2-4 个节点，当前为 ${count}`);
    }
  }
  return semantic;
}

export async function composeDocument(request: ComposeRequest): Promise<ComposeResult> {
  const document = request.document.trim();
  if (document.length < 20) throw new Error("输入文档内容过短，无法提取系统图谱");
  if (document.length > 160_000) throw new Error("输入文档超过 160000 字符，请先拆分或摘要");
  const maxAttempts = Math.max(1, Math.min(4, request.maxAttempts ?? 3));
  let previous = "";
  let validationError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const repair = attempt === 1 ? "" : `\n\n上一次输出未通过校验。请重新生成完整 JSON，不要只给补丁。\n校验错误：\n${validationError}\n上一次输出：\n${previous.slice(0, 24_000)}`;
    const output = await request.client.generate({
      instructions: instructions(request.profile),
      input: `将下面文档整理为系统图谱语义规格：\n\n${document}${repair}`,
      jsonSchema: semanticJsonSchema(request.profile),
    });
    previous = output;
    try {
      const semantic = validateForProfile(parseModelJson(output), request.profile);
      return { spec: assembleSpec(semantic, request.profile), attempts: attempt, provider: request.client.provider, model: request.client.model };
    } catch (error) {
      validationError = formatValidationError(error);
      if (attempt === maxAttempts) throw new Error(`模型在 ${maxAttempts} 次尝试后仍未生成有效规格：\n${validationError}`);
    }
  }
  throw new Error("规格生成失败");
}
