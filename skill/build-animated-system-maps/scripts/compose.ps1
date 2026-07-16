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
    [ValidateRange(100, 600000)][int]$ApiTimeoutMs = 120000,
    [ValidateRange(0, 5)][int]$ApiRetries = 2,
    [ValidateRange(0, 30000)][int]$ApiRetryDelayMs = 500,
    [string]$SpecOut,
    [ValidateSet('paper-color', 'blueprint', 'whiteboard', 'ink-wash')][string]$Theme,
    [ValidateSet('presentation', 'article', 'wechat', 'square', 'print-a4')][string]$Canvas
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$LocalCli = Join-Path $RepoRoot 'dist\src\cli.js'
$FormatValue = $Formats -join ','
$Arguments = @(
    'compose', '--input', (Resolve-Path $InputDocument), '--outdir', $OutDir,
    '--profile', $Profile, '--basename', $BaseName, '--formats', $FormatValue,
    '--max-attempts', $MaxAttempts,
    '--api-timeout-ms', $ApiTimeoutMs,
    '--api-retries', $ApiRetries,
    '--api-retry-delay-ms', $ApiRetryDelayMs
)
if ($Model) { $Arguments += @('--model', $Model) }
if ($BaseUrl) { $Arguments += @('--base-url', $BaseUrl) }
if ($ApiStyle) { $Arguments += @('--api-style', $ApiStyle) }
if ($SpecOut) { $Arguments += @('--spec-out', $SpecOut) }
if ($Theme) { $Arguments += @('--theme', $Theme) }
if ($Canvas) { $Arguments += @('--canvas', $Canvas) }

if (Test-Path $LocalCli) {
    & node $LocalCli @Arguments
} elseif (Get-Command paper-atlas -ErrorAction SilentlyContinue) {
    & paper-atlas @Arguments
} else {
    throw '未找到编排引擎。请先安装 paper-atlas CLI，或在源码仓库运行 scripts/setup.ps1。'
}
if ($LASTEXITCODE -ne 0) { throw "paper-atlas compose 执行失败，退出码 $LASTEXITCODE" }
