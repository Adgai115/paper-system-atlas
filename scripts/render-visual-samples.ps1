[CmdletBinding()]
param(
    [string]$OutDir = 'outputs/visual-regression',
    [switch]$IncludeGif
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

npm run build

$formats = if ($IncludeGif) { 'svg,png,gif,excalidraw' } else { 'svg,png,excalidraw' }
foreach ($layout in @('layered', 'lanes', 'radial')) {
    node dist/src/cli.js render `
        --spec examples/intelligent-collaboration.json `
        --outdir $OutDir `
        --basename "intelligent-collaboration-$layout" `
        --layout $layout `
        --formats $formats `
        --verify
    if ($LASTEXITCODE -ne 0) { throw "布局 $layout 渲染或验证失败" }
}
