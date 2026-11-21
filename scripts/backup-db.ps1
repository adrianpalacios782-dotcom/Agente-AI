# ==============================================================================
# Respaldo de PostgreSQL (Docker) para ADRIAN AI
# Uso: npm run backup:db (desde D:\adrian-ai)
# ==============================================================================
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $Root "backups"
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

$User = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "adrian" }
$Db = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "adrian_ai" }
$Stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$OutFile = Join-Path $BackupDir "adrian_ai_$Stamp.sql"

docker exec adrian-ai-postgres pg_dump -U $User -d $Db --no-owner --no-acl | Set-Content -Path $OutFile -Encoding UTF8
Write-Host "Backup guardado en: $OutFile"
