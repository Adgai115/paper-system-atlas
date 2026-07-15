# Paper System Atlas

一个中文优先、纸张彩色手绘风格的语义化系统地图引擎。

它从内容规格自动计算布局，以 SVG 作为主要可编辑格式，同时输出 PNG、JPG、GIF 和 Excalidraw。项目使用独立协议、场景模型、布局算法和渲染实现。

## Windows 快速开始

```powershell
./scripts/setup.ps1
./scripts/render-example.ps1
```

生成分层、泳道和径向三种中文视觉回归样例：

```powershell
./scripts/render-visual-samples.ps1
# 如需同时检查三种布局的动画：
./scripts/render-visual-samples.ps1 -IncludeGif
```

也可以直接运行：

```powershell
npm install
npm run build
node dist/src/cli.js render `
  --spec examples/intelligent-collaboration.json `
  --outdir outputs `
  --basename demo `
  --formats svg,png,jpg,gif,excalidraw `
  --verify
```

## 文档一键生成

`compose` 会把 Markdown 或 TXT 文档交给配置的模型，生成语义规格，经过 Zod 校验和自动修复后，再调用渲染引擎输出图像。这个入口补齐了“原文 → 规格 → 图像”的完整部署链路，不再需要人工编写 JSON。

```powershell
$env:PAPER_ATLAS_API_KEY = '<模型密钥>'
$env:PAPER_ATLAS_MODEL = '<模型名称>'

./scripts/compose.ps1 `
  -InputDocument examples/ai-loop-source.md `
  -Profile atlas-showcase `
  -OutDir outputs/compose `
  -BaseName ai-loop
```

模型适配配置：

- 默认调用 `https://api.openai.com/v1/responses`，使用严格 JSON Schema 输出。
- `PAPER_ATLAS_BASE_URL` 可切换到兼容端点。
- `PAPER_ATLAS_API_STYLE=chat-completions` 可切换到 `/chat/completions`。
- 同时兼容 `OPENAI_API_KEY`、`OPENAI_MODEL` 和 `OPENAI_BASE_URL`。
- 密钥只从环境变量读取，不通过命令行参数传递。

生成的 `<basename>.atlas.json` 会和图像一起保存在输出目录。模型输出不合法时，命令会把中文校验错误反馈给模型并自动重试，最多三次；所有输出始终经过本地校验和真实文件验证。

## 设计原则

- 中文优先，技术缩写按需保留。
- 内容描述与视觉布局分离。
- SVG 是统一场景表达，Excalidraw 是必须支持的编辑出口。
- 纸张、墨线和彩色水洗是默认风格，主题字段允许完全自定义。
- 默认四阶段分层图采用窄—宽—宽—窄的非对称构图，并通过左右汇聚枢纽形成自然线束。
- 连线会在节点外寻找低冲突走廊，并以圆润手绘折线避开非端点节点。
- Windows、中文路径与无 FFmpeg 环境是一等使用场景。

## 视觉配置

`layout.profile` 支持两种工作方式：

- `adaptive`：默认自适应排版，适合任意分组、节点数量和三种布局。
- `atlas-showcase`：四阶段分层图的高保真展示模板，固定采用 1674×941 参考构图，并补全双汇聚点、内部编排链、记忆与上下文、图例、批注、设计原则、罗盘和山景。所有内容仍为可编辑 SVG/Excalidraw 元素，不嵌入参考位图。

示例 `examples/intelligent-collaboration.json` 已启用 `atlas-showcase`；通过 CLI 使用 `--layout lanes` 或 `--layout radial` 时会自动回到 `adaptive`，以保持自动布局能力。

AI Loop 测试示例同时展示两种配置：

- `examples/ai-loop-atlas-showcase.json`：四阶段高保真展示图。
- `examples/ai-loop-adaptive.json`：六阶段径向反馈闭环。

## 当前状态

当前为原创 MVP 开发版本，许可证与最终公开项目名称尚未确定。
