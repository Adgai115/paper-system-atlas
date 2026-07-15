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

## 设计原则

- 中文优先，技术缩写按需保留。
- 内容描述与视觉布局分离。
- SVG 是统一场景表达，Excalidraw 是必须支持的编辑出口。
- 纸张、墨线和彩色水洗是默认风格，主题字段允许完全自定义。
- 默认四阶段分层图采用窄—宽—宽—窄的非对称构图，并通过左右汇聚枢纽形成自然线束。
- 连线会在节点外寻找低冲突走廊，并以圆润手绘折线避开非端点节点。
- Windows、中文路径与无 FFmpeg 环境是一等使用场景。

## 当前状态

当前为原创 MVP 开发版本，许可证与最终公开项目名称尚未确定。
