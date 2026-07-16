[CmdletBinding(DefaultParameterSetName = 'Document')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Document')][string]$InputDocument,
    [Parameter(Mandatory = $true, ParameterSetName = 'Spec')][string]$Spec
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$LocalCli = Join-Path $RepoRoot 'dist\src\cli.js'
$Arguments = if ($PSCmdlet.ParameterSetName -eq 'Spec') {
    @('plan', '--spec', (Resolve-Path $Spec))
} else {
    @('plan', '--input', (Resolve-Path $InputDocument))
}

if (Test-Path $LocalCli) {
    & node $LocalCli @Arguments
} elseif (Get-Command paper-atlas -ErrorAction SilentlyContinue) {
    & paper-atlas @Arguments
} else {
    throw '未找到规划引擎。请先安装 paper-atlas CLI。'
}
if ($LASTEXITCODE -ne 0) { throw "paper-atlas plan 执行失败，退出码 $LASTEXITCODE" }
