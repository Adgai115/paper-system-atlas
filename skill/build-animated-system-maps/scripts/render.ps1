[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Spec,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$BaseName = 'system-map',
    [string[]]$Formats = @('svg,png,jpg,gif,excalidraw'),
    [ValidateSet('layered', 'lanes', 'radial')][string]$Layout,
    [ValidateSet('paper-color', 'blueprint', 'whiteboard', 'ink-wash')][string]$Theme,
    [ValidateSet('presentation', 'article', 'wechat', 'square', 'print-a4')][string]$Canvas,
    [switch]$Verify
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$LocalCli = Join-Path $RepoRoot 'dist\src\cli.js'
$FormatValue = $Formats -join ','
$Arguments = @('render', '--spec', (Resolve-Path $Spec), '--outdir', $OutDir, '--basename', $BaseName, '--formats', $FormatValue)
if ($Layout) { $Arguments += @('--layout', $Layout) }
if ($Theme) { $Arguments += @('--theme', $Theme) }
if ($Canvas) { $Arguments += @('--canvas', $Canvas) }
if ($Verify) { $Arguments += '--verify' }

if (Test-Path $LocalCli) {
    & node $LocalCli @Arguments
} elseif (Get-Command paper-atlas -ErrorAction SilentlyContinue) {
    & paper-atlas @Arguments
} else {
    throw '未找到渲染引擎。请先在项目根目录运行 scripts/setup.ps1，或安装 paper-atlas CLI。'
}
