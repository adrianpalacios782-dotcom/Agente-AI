# ==============================================================================
# ADRIAN AI — Levantar todo el entorno (Windows / PowerShell)
# Ejecuta desde la raíz del repo: .\scripts\levantar.ps1
# Queda en PRIMER PLANO: presiona Ctrl+C para detener el servidor.
# ==============================================================================
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT_DIR

Write-Host "============================================================"
Write-Host "  ADRIAN AI — Levantando entorno completo (Windows)"
Write-Host "  Directorio: $ROOT_DIR"
Write-Host "============================================================"

# 1. Verificar .env
if (-not (Test-Path ".env")) {
    Write-Host "ERROR: No existe .env. Copia .env.example a .env y pega tu GOOGLE_GENAI_API_KEY." -ForegroundColor Red
    exit 1
}

$envContent = Get-Content ".env" -Raw
if (-not ($envContent -match "GOOGLE_GENAI_API_KEY=") -or ($envContent -match "GOOGLE_GENAI_API_KEY=$") -or ($envContent -match "GOOGLE_GENAI_API_KEY=pega_aqui_tu_api_key")) {
    Write-Host "ERROR: Configura GOOGLE_GENAI_API_KEY en .env antes de continuar." -ForegroundColor Red
    exit 1
}

# 2. Levantar Docker (PostgreSQL 16 + pgvector)
Write-Host ""
Write-Host "[1/5] Levantando PostgreSQL + pgvector (Docker)..." -ForegroundColor Cyan
docker compose up -d

Write-Host "Esperando a que PostgreSQL esté listo..."
$postgresListo = $false
for ($i = 1; $i -le 30; $i++) {
    $listo = docker compose exec -T postgres pg_isready -U "${env:POSTGRES_USER:-adrian}" -d "${env:POSTGRES_DB:-adrian_ai}" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  PostgreSQL listo." -ForegroundColor Green
        $postgresListo = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $postgresListo) {
    Write-Host "  Advertencia: PostgreSQL no respondió a tiempo, pero se continua." -ForegroundColor Yellow
}

# 3. Poblar base de datos
Write-Host ""
Write-Host "[2/5] Poblando memoria y proyectos en PostgreSQL..." -ForegroundColor Cyan
npm run seed:db

# 4. Verificar tipos
Write-Host ""
Write-Host "[3/5] Verificando tipos (typecheck)..." -ForegroundColor Cyan
npm run typecheck

# 5. Construir frontend y arrancar servidor en PRIMER PLANO
Write-Host ""
Write-Host "[4/5] Construyendo frontend (build:web)..." -ForegroundColor Cyan
npm run build:web

Write-Host ""
Write-Host "[5/5] Arrancando servidor en http://127.0.0.1:8001" -ForegroundColor Cyan
Write-Host "============================================================"
Write-Host "  ¡Listo! Abre: http://127.0.0.1:8001" -ForegroundColor Green
Write-Host "  Para detener: presiona Ctrl+C en esta terminal" -ForegroundColor Yellow
Write-Host "============================================================"
Write-Host ""

npm start
