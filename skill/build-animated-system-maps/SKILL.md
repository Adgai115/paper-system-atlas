---
name: build-animated-system-maps
description: Create Chinese-first professional system maps and article illustrations as editable SVG, PNG, JPG, animated GIF, or Excalidraw. Use when an Agent needs to turn an article, workflow, multi-agent system, architecture, technical explanation, or process into a paper-style diagram; also use for machine-readable planning, batch rendering, verified diagram artifacts, dynamic system maps, presentation graphics, or 公众号配图.
---

# Build Animated System Maps

Turn source material into a semantic system-map specification, then render verified editable and raster outputs with the bundled engine. This is an Agent-facing skill and CLI, not a browser application. Prefer `scripts/plan.ps1` before uncertain work, `compose.ps1` for source documents, `render.ps1` for existing specifications, and `batch.ps1` for multiple specifications.

## Workflow

1. Run `plan` on the document or specification when layout, theme, canvas, or output formats are uncertain. Consume its JSON recommendation and risks.
2. Extract actors, stages, capabilities, data flows, feedback loops, outputs, and supporting notes.
3. Group the content into two to eight semantic regions. Keep node titles short and descriptions under two lines when possible.
4. Start from a valid specification. Read `references/spec-format.md` for field details and layout choices.
5. Prefer Chinese labels when the source or user is Chinese. Retain only necessary technical abbreviations.
6. Render the required formats. Keep verification enabled; batch rendering verifies every item by default.
7. Inspect warnings and the PNG. Fix route crossings, cramped text, weak hierarchy, or ambiguous flow and rerender.
8. Deliver SVG and Excalidraw as editable sources plus requested raster formats and the JSON report or batch manifest.

`plan` is cheap and machine-readable; use it before `preview`. Use `preview` only when the plan reports risks or visual selection is still ambiguous. It renders layered, lanes, and radial variants plus a comparison sheet.

## Content Rules

- Describe meaning in the specification; do not assign pixel coordinates.
- Use groups for architecture layers, stages, domains, or swimlanes.
- Use edges to express real dependencies or flow. Avoid decorative connections.
- Use feedback edges only for genuine retries, learning, or verification loops.
- Use the recommended preset unless the user specifies one: `paper-color`, `blueprint`, `whiteboard`, or `ink-wash`.
- Preserve sufficient whitespace for presentation and article cropping.

## Render

Plan from a source document or a ready specification without calling a model:

```powershell
./scripts/plan.ps1 -InputDocument <article.md>
./scripts/plan.ps1 -Spec <spec.json>
```

The command returns JSON with `recommendation`, `signals`, `risks`, candidate layout scores, and `nextCommand`.

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

For a multi-layout comparison:

```powershell
paper-atlas preview `
  --spec <spec.json> `
  --outdir <output-directory> `
  --basename <descriptive-name> `
  --verify
```

For a directory of specifications, continue past invalid items and write one manifest:

```powershell
./scripts/batch.ps1 `
  -InputPath <spec-directory> `
  -OutDir <output-directory> `
  -Formats 'svg,png,excalidraw'
```

The default batch mode automatically chooses layout, theme, and canvas per item and verifies every output. Read `batch-manifest.json`; do not infer success from file presence alone.

The CLI accepts `--input -` and `--spec -` for pipelines. Success is JSON on stdout. Failure is JSON on stderr with stable exit codes: `1` execution or verification, `2` invalid arguments/input, `3` model configuration, `4` filesystem.

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
- Review the `warnings` array for truncation risk, high density, long routes, and edge-label collisions even when structural verification passes.
- For batch work, require `manifest.ok === true`; report individual `items[].error` values otherwise.
