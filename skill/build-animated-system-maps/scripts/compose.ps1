[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$InputDocument,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [ValidateSet('atlas-showcase', 'adaptive')][string]$Profile = 'atlas-showcase',
    [string]$BaseName = 'system-map',
    [string[]]$Formats = @('svg,png,jpg,gif,excalidraw'),
    [string]$Model,
    [string]$BaseUrl,
    [ValidateSet('responses', 'chat-completions')][string]$ApiStyle,
    [ValidateRange(1, 4)][int]$MaxAttempts = 3,
    [string]$SpecOut
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$LocalCli = Join-Path $RepoRoot 'dist\src\cli.js'
$FormatValue = $Formats -join ','
$Arguments = @(
    'compose', '--input', (Resolve-Path $InputDocument), '--outdir', $OutDir,
    '--profile', $Profile, '--basename', $BaseName, '--formats', $FormatValue,
    '--max-attempts', $MaxAttempts
)
if ($Model) { $Arguments += @('--model', $Model) }
if ($BaseUrl) { $Arguments += @('--base-url', $BaseUrl) }
if ($ApiStyle) { $Arguments += @('--api-style', $ApiStyle) }
if ($SpecOut) { $Arguments += @('--spec-out', $SpecOut) }

if (Test-Path $LocalCli) {
    & node $LocalCli @Arguments
} elseif (Get-Command paper-atlas -ErrorAction SilentlyContinue) {
    & paper-atlas @Arguments
} else {
    throw '未找到编排引擎。请先安装 paper-atlas CLI，或在源码仓库运行 scripts/setup.ps1。'
}
if ($LASTEXITCODE -ne 0) { throw "paper-atlas compose 执行失败，退出码 $LASTEXITCODE" }
