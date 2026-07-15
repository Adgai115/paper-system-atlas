[CmdletBinding()]
param(
    [string]$OutDir = 'outputs',
    [string]$BaseName = 'intelligent-collaboration'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path 'dist/src/cli.js')) {
    npm run build
}

node dist/src/cli.js render `
    --spec examples/intelligent-collaboration.json `
    --outdir $OutDir `
    --basename $BaseName `
    --formats svg,png,jpg,gif,excalidraw `
    --verify
