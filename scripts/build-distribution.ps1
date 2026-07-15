[CmdletBinding()]
param(
    [string]$OutDir = 'dist-package'
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
Set-Location $Root

npm run check
if ($LASTEXITCODE -ne 0) { throw "构建或测试失败，退出码 $LASTEXITCODE" }

$Destination = [System.IO.Path]::GetFullPath((Join-Path $Root $OutDir))
if (-not $Destination.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "输出目录必须位于项目目录内：$Destination"
}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$PackOutput = npm pack --pack-destination $Destination --json
if ($LASTEXITCODE -ne 0) { throw "npm 安装包生成失败，退出码 $LASTEXITCODE" }
$Pack = $PackOutput | ConvertFrom-Json | Select-Object -First 1
$RuntimeArchive = Join-Path $Destination $Pack.filename

$SkillSource = Join-Path $Root 'skill\build-animated-system-maps\*'
$SkillArchive = Join-Path $Destination 'build-animated-system-maps-skill.zip'
Compress-Archive -Path $SkillSource -DestinationPath $SkillArchive -CompressionLevel Optimal -Force

$Report = [ordered]@{
    ok = $true
    runtime = [ordered]@{
        file = $RuntimeArchive
        bytes = (Get-Item $RuntimeArchive).Length
        unpackedBytes = $Pack.unpackedSize
        entries = $Pack.entryCount
        install = "npm install -g `"$RuntimeArchive`""
    }
    skill = [ordered]@{
        file = $SkillArchive
        bytes = (Get-Item $SkillArchive).Length
        install = '解压到 Codex skills 目录后重启 Codex；脚本会调用全局 paper-atlas'
    }
}
$Report | ConvertTo-Json -Depth 5
