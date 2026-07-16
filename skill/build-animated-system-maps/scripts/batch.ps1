[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string[]]$Formats,
    [ValidateSet('auto', 'layered', 'lanes', 'radial')][string]$Layout = 'auto',
    [string]$Theme = 'auto',
    [string]$Canvas = 'auto',
    [switch]$Recursive,
    [switch]$NoVerify,
    [string]$Manifest
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$LocalCli = Join-Path $RepoRoot 'dist\src\cli.js'
$Arguments = @('batch', '--input', (Resolve-Path $InputPath), '--outdir', $OutDir, '--layout', $Layout, '--theme', $Theme, '--canvas', $Canvas)
if ($Formats) { $Arguments += @('--formats', ($Formats -join ',')) }
if ($Recursive) { $Arguments += '--recursive' }
if ($NoVerify) { $Arguments += '--no-verify' }
if ($Manifest) { $Arguments += @('--manifest', $Manifest) }

if (Test-Path $LocalCli) {
    & node $LocalCli @Arguments
} elseif (Get-Command paper-atlas -ErrorAction SilentlyContinue) {
    & paper-atlas @Arguments
} else {
    throw '未找到批处理引擎。请先安装 paper-atlas CLI。'
}
if ($LASTEXITCODE -ne 0) { throw "paper-atlas batch 执行完成但包含失败项，退出码 $LASTEXITCODE；请读取 batch-manifest.json" }
