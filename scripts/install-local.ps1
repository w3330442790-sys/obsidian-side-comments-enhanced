param([Parameter(Mandatory=$true)][string]$VaultPath)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$resolvedVault = (Resolve-Path -LiteralPath $VaultPath).Path
$targetPath = Join-Path $resolvedVault '.obsidian\plugins\side-comments-origin'
$target = (Resolve-Path -LiteralPath $targetPath).Path
if (-not $target.StartsWith($resolvedVault.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Target is outside the requested vault' }
$manifest = Get-Content -Raw -LiteralPath (Join-Path $projectPath 'manifest.json') | ConvertFrom-Json
$installed = Get-Content -Raw -LiteralPath (Join-Path $target 'manifest.json') | ConvertFrom-Json
if ($manifest.id -ne 'side-comments-origin' -or $manifest.version -ne '1.1.0' -or $installed.id -ne $manifest.id) { throw 'Unexpected plugin identity/version' }
$backupPath = Join-Path $projectPath ('private\before-install-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
Copy-Item -LiteralPath $target -Destination (Join-Path $backupPath 'plugin') -Recurse
foreach ($name in @('main.js','styles.css','manifest.json')) {
    $source = Join-Path $projectPath $name
    Copy-Item -LiteralPath $source -Destination (Join-Path $target $name) -Force
    if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath (Join-Path $target $name)).Hash) { throw "Installed file hash mismatch: $name" }
}
[pscustomobject]@{ Version = $manifest.version; InstalledPath = $target; BackupPath = $backupPath } | ConvertTo-Json
