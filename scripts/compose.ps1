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
$SkillEntry = Join-Path $PSScriptRoot '..\skill\build-animated-system-maps\scripts\compose.ps1'
& $SkillEntry @PSBoundParameters
if ($LASTEXITCODE -ne 0) { throw "compose 执行失败，退出码 $LASTEXITCODE" }
