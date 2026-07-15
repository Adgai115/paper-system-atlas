[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Spec,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$BaseName = 'system-map',
    [string[]]$Formats = @('svg,png,jpg,gif,excalidraw'),
    [switch]$Verify
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$LocalCli = Join-Path $RepoRoot 'dist\src\cli.js'
$FormatValue = $Formats -join ','
$Arguments = @('render', '--spec', (Resolve-Path $Spec), '--outdir', $OutDir, '--basename', $BaseName, '--formats', $FormatValue)
if ($Verify) { $Arguments += '--verify' }

if (Test-Path $LocalCli) {
    & node $LocalCli @Arguments
} elseif (Get-Command paper-atlas -ErrorAction SilentlyContinue) {
    & paper-atlas @Arguments
} else {
    throw '未找到渲染引擎。请先在项目根目录运行 scripts/setup.ps1，或安装 paper-atlas CLI。'
}
