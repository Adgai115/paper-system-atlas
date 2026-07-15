---
name: build-animated-system-maps
description: Create Chinese-first professional system architecture maps and article illustrations in an editable paper-and-colored-ink style. Use when the user asks to turn an article, workflow, multi-agent system, product architecture, technical explanation, or process into SVG, PNG, JPG, animated GIF, or Excalidraw outputs; also use when the user requests a paper-style hand-drawn architecture diagram, dynamic system map, presentation graphic, or 公众号配图.
---

# Build Animated System Maps

Turn source material into a semantic system-map specification, then render verified editable and raster outputs with the bundled engine. Prefer the end-to-end `compose.ps1` entry when a model endpoint is configured; use `render.ps1` when the user already supplies a specification.

## Workflow

1. Extract actors, stages, capabilities, data flows, feedback loops, outputs, and supporting notes.
2. Group the content into two to eight semantic regions. Keep node titles short and descriptions under two lines when possible.
3. Start from a valid specification. Read `references/spec-format.md` for field details and layout choices.
4. Prefer Chinese labels when the source or user is Chinese. Retain only necessary technical abbreviations.
5. Render SVG, PNG, JPG, GIF, and Excalidraw with `scripts/render.ps1` on Windows.
6. Require `--verify` before delivery.
7. Inspect the PNG visually. Fix overlapping routes, cramped text, weak hierarchy, or ambiguous flow in the specification and rerender.
8. Deliver SVG and Excalidraw as editable sources plus the requested raster or animated formats.

## Content Rules

- Describe meaning in the specification; do not assign pixel coordinates.
- Use groups for architecture layers, stages, domains, or swimlanes.
- Use edges to express real dependencies or flow. Avoid decorative connections.
- Use feedback edges only for genuine retries, learning, or verification loops.
- Keep the default paper-color theme unless the user requests a custom theme.
- Preserve sufficient whitespace for presentation and article cropping.

## Render

For a Markdown or TXT source document, compose and render in one command:

```powershell
$env:PAPER_ATLAS_API_KEY = '<your-api-key>'
$env:PAPER_ATLAS_MODEL = '<model-name>'
./scripts/compose.ps1 `
  -InputDocument <article.md> `
  -Profile atlas-showcase `
  -OutDir <output-directory> `
  -BaseName <descriptive-name>
```

The endpoint defaults to the OpenAI Responses API. Set `PAPER_ATLAS_BASE_URL` for a compatible endpoint and `PAPER_ATLAS_API_STYLE=chat-completions` when the provider exposes Chat Completions instead.

For an existing semantic specification:

```powershell
./scripts/render.ps1 `
  -Spec <spec.json> `
  -OutDir <output-directory> `
  -BaseName <descriptive-name> `
  -Formats 'svg,png,jpg,gif,excalidraw' `
  -Verify
```

The wrapper uses the repository CLI when present and falls back to a globally installed `paper-atlas` command.

For a compact deployment without the source repository, install the generated runtime archive globally, then unpack `build-animated-system-maps-skill.zip` into the Codex skills directory:

```powershell
npm install -g <paper-system-atlas.tgz>
paper-atlas doctor
```

The GIF exporter caches the static paper scene and paints only moving signal trails, halos, and node responses on each frame. Do not replace this optimized path with per-frame full SVG rasterization unless a requested effect cannot be represented by the motion overlay.

## Quality Gate

- Confirm SVG contains editable text and vector paths.
- Confirm PNG/JPG dimensions match the specification.
- Confirm GIF has the requested frame count and genuine motion.
- Confirm Excalidraw IDs are unique, text uses `fontFamily: 5`, and `files` is empty.
- Ensure Chinese glyphs render correctly on the current machine.
- Do not deliver a diagram with clipped text, crossing through node bodies, or unreadable labels.
