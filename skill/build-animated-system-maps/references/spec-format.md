# 规格格式

规格只描述语义，不包含坐标。

## 顶层字段

- `meta`: 标题、副标题、语言。
- `canvas`: 宽度、高度、GIF 帧率与帧数。
- `layout`: `layered`、`lanes` 或 `radial`，以及布局方向。
- `theme`: 纸张色、墨色、调色板、字体、纹理和手绘强度。
- `groups`: 两到八个语义分区，数组顺序决定主要阅读顺序。
- `nodes`: 属于某个分区的内容节点。
- `edges`: 节点之间的信号、任务、结果或反馈流。
- `notes`: 画布边缘的简短编辑注释。

## 节点

每个节点必须包含唯一 `id`、有效 `group` 和 `title`。`description` 应简短。可用图标：

`chat`, `calendar`, `voice`, `document`, `target`, `plan`, `route`, `shield`, `browser`, `knowledge`, `code`, `media`, `report`, `message`, `dashboard`, `archive`, `memory`。

## 主题

颜色必须使用 `#RRGGBB`。默认纸张主题位于 `assets/paper-color-theme.json`。Windows 默认优先使用楷体和微软雅黑；跨平台发行版应随包提供开放许可字体。

## 布局选择

- `layered`: 从左到右的架构层、处理链和文章解释图。
- `lanes`: 多角色协作、职责泳道、状态流程。
- `radial`: 中心平台与外围能力、生态或事件总线。

优先通过分组和连线改变布局，不要在文案中塞入空格或换行来强行控制位置。
