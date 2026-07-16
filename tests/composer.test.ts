import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { createOpenAICompatibleClient, semanticJsonSchema } from "../src/composer.js";

const execFileAsync = promisify(execFile);

function showcaseSemantic() {
  return {
    meta: { title: "AI 循环图谱", subtitle: "Agent Loop · 持续反馈", description: "目标、行动、观察和修正构成的智能体闭环" },
    layout: { mode: "layered" },
    groups: [
      { id: "input", title: "目标触发", note: "目标、事件和上下文" },
      { id: "core", title: "核心循环", note: "推理、计划和执行" },
      { id: "learning", title: "反馈增强", note: "评估、记忆和修正" },
      { id: "delivery", title: "安全交付", note: "人工确认和结果" },
    ],
    nodes: [
      { id: "goal", group: "input", title: "用户目标", description: "定义结果与完成标准", icon: "target" },
      { id: "event", group: "input", title: "事件触发", description: "对话与业务状态变化", icon: "chat" },
      { id: "reason", group: "core", title: "理解推理", description: "识别约束和缺失信息", icon: "target" },
      { id: "act", group: "core", title: "调用工具", description: "搜索、接口和代码执行", icon: "route" },
      { id: "evaluate", group: "learning", title: "观察评估", description: "读取结果并判断完成度", icon: "shield" },
      { id: "memory", group: "learning", title: "记忆更新", description: "保存经验并调整行为", icon: "memory" },
      { id: "human", group: "delivery", title: "人工确认", description: "高风险动作等待批准", icon: "message" },
      { id: "result", group: "delivery", title: "结果交付", description: "报告、回复或系统动作", icon: "report" },
    ],
    edges: [
      { from: "goal", to: "reason", kind: "signal", animated: true },
      { from: "event", to: "act", kind: "signal", animated: true },
      { from: "reason", to: "act", kind: "task", animated: false },
      { from: "act", to: "evaluate", kind: "result", animated: true },
      { from: "evaluate", to: "memory", kind: "feedback", animated: true },
      { from: "memory", to: "reason", kind: "feedback", animated: true },
      { from: "evaluate", to: "human", kind: "task", animated: true },
      { from: "human", to: "result", kind: "result", animated: true },
    ],
    notes: [{ text: "Reason → Act → Observe → Evaluate", anchor: "top-right" }],
  };
}

test("OpenAI 兼容适配器支持 Chat Completions 严格结构化输出", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = createOpenAICompatibleClient({
    apiKey: "test-key", model: "mock-model", baseUrl: "https://mock.invalid/v1", apiStyle: "chat-completions",
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://mock.invalid/v1/chat/completions");
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(showcaseSemantic()) } }] }), { status: 200 });
    },
  });
  const output = await client.generate({ instructions: "只输出 JSON", input: "AI Loop 文档", jsonSchema: semanticJsonSchema("atlas-showcase") });
  assert.equal(JSON.parse(output).meta.title, "AI 循环图谱");
  const format = requestBody?.response_format as { json_schema?: { strict?: boolean } };
  assert.equal(format.json_schema?.strict, true);
});

test("模型接口对限流和 5xx 使用指数退避后重试", async () => {
  let calls = 0;
  const delays: number[] = [];
  const client = createOpenAICompatibleClient({
    apiKey: "test-key", model: "mock-model", maxRetries: 2, retryDelayMs: 25,
    sleepImpl: async (delayMs) => { delays.push(delayMs); },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("busy", { status: 503 });
      if (calls === 2) return new Response("limited", { status: 429 });
      return new Response(JSON.stringify({ output_text: JSON.stringify(showcaseSemantic()) }), { status: 200 });
    },
  });
  const output = await client.generate({ instructions: "只输出 JSON", input: "测试", jsonSchema: semanticJsonSchema("atlas-showcase") });
  assert.equal(JSON.parse(output).meta.title, "AI 循环图谱");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [25, 50]);
});

test("模型接口超时会按配置重试并给出稳定错误", async () => {
  let calls = 0;
  const client = createOpenAICompatibleClient({
    apiKey: "test-key", model: "mock-model", timeoutMs: 20, maxRetries: 1, retryDelayMs: 0,
    fetchImpl: async (_input, init) => {
      calls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return reject(new Error("缺少超时信号"));
        if (signal.aborted) return reject(signal.reason);
        const guard = setTimeout(() => reject(new Error("模拟请求未被超时信号中止")), 1000);
        signal.addEventListener("abort", () => { clearTimeout(guard); reject(signal.reason); }, { once: true });
      });
    },
  });
  await assert.rejects(
    client.generate({ instructions: "只输出 JSON", input: "测试", jsonSchema: semanticJsonSchema("atlas-showcase") }),
    /模型接口请求失败（2 次尝试）：模型接口请求超时/,
  );
  assert.equal(calls, 2);
});

test("模型接口不会重试不可恢复的 4xx", async () => {
  let calls = 0;
  const client = createOpenAICompatibleClient({
    apiKey: "test-key", model: "mock-model", maxRetries: 3, retryDelayMs: 0,
    fetchImpl: async () => { calls += 1; return new Response("bad request", { status: 400 }); },
  });
  await assert.rejects(
    client.generate({ instructions: "只输出 JSON", input: "测试", jsonSchema: semanticJsonSchema("atlas-showcase") }),
    /HTTP 400/,
  );
  assert.equal(calls, 1);
});

test("compose CLI 从中文文档调用模型、自动修复规格并真实渲染", async () => {
  let calls = 0;
  let sawDocument = false;
  let sawRepair = false;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body) as { input?: string; text?: { format?: { strict?: boolean } } };
    calls += 1;
    sawDocument ||= payload.input?.includes("智能体持续反馈闭环") ?? false;
    sawRepair ||= payload.input?.includes("上一次输出未通过校验") ?? false;
    assert.equal(payload.text?.format?.strict, true);
    const text = calls === 1 ? "{}" : JSON.stringify(showcaseSemantic());
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const root = await mkdtemp(path.join(os.tmpdir(), "图谱编排-"));
  const input = path.join(root, "AI 循环说明.md");
  const outdir = path.join(root, "中文 输出");
  await writeFile(input, await readFile(new URL("../examples/ai-loop-source.md", import.meta.url), "utf8"), "utf8");
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "--import", "tsx", "src/cli.ts", "compose",
      "--input", input, "--profile", "atlas-showcase", "--outdir", outdir,
      "--basename", "AI-Loop-自动生成", "--formats", "svg,png,excalidraw", "--max-attempts", "3",
    ], {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      env: { ...process.env, PAPER_ATLAS_API_KEY: "test-key", PAPER_ATLAS_MODEL: "mock-model", PAPER_ATLAS_BASE_URL: `http://127.0.0.1:${address.port}/v1` },
      maxBuffer: 2_000_000,
    });
    const report = JSON.parse(stdout) as { ok: boolean; composition: { attempts: number; spec: string }; result: { files: Record<string, string> } };
    assert.equal(report.ok, true);
    assert.equal(report.composition.attempts, 2);
    assert.equal(calls, 2);
    assert.equal(sawDocument, true);
    assert.equal(sawRepair, true);
    const spec = JSON.parse(await readFile(report.composition.spec, "utf8"));
    assert.equal(spec.layout.profile, "atlas-showcase");
    for (const format of ["svg", "png", "excalidraw"]) assert.ok(report.result.files[format]);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});
