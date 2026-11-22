# ==============================================================================
# ADRIAN AI — Levantar todo el entorno (Windows / PowerShell)
# Ejecuta desde la raíz del repo: .\scripts\levantar.ps1
# Queda en PRIMER PLANO: presiona Ctrl+C para detener el servidor.
# ==============================================================================
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT_DIR

$codigoSalida = 0

try {
    Write-Host "============================================================"
    Write-Host "  ADRIAN AI — Levantando entorno completo (Windows)"
    Write-Host "  Directorio: $ROOT_DIR"
    Write-Host "============================================================"

    # 0. Verificar que el puerto esté libre (evita el típico EADDRINUSE)
    $ocupado = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue
    if ($ocupado) {
        $pidOcupante = ($ocupado | Select-Object -First 1).OwningProcess
        Write-Host "ERROR: el puerto 8001 ya está en uso por el proceso $pidOcupante." -ForegroundColor Red
        Write-Host "Detén ese proceso (Stop-Process -Id $pidOcupante) y vuelve a ejecutar." -ForegroundColor Red
        throw "Puerto 8001 ocupado"
    }

    # 1. Verificar .env
    if (-not (Test-Path ".env")) {
        throw "No existe .env. Copia .env.example a .env y pega tu GOOGLE_GENAI_API_KEY."
    }

    $envContent = Get-Content ".env" -Raw
    if ($envContent -notmatch "GOOGLE_GENAI_API_KEY=" -or $envContent -match "GOOGLE_GENAI_API_KEY=$" -or $envContent -match "GOOGLE_GENAI_API_KEY=pega_aqui_tu_api_key") {
        throw "Configura GOOGLE_GENAI_API_KEY en .env antes de continuar."
    }

    # 2. Levantar Docker (PostgreSQL 16 + pgvector)
    Write-Host ""
    Write-Host "[1/5] Levantando PostgreSQL + pgvector (Docker)..." -ForegroundColor Cyan
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw "No se pudo levantar Docker." }

    Write-Host "Esperando a que PostgreSQL esté listo..."
    $pgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "adrian" }
    $pgDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "adrian_ai" }
    $postgresListo = $false
    for ($i = 1; $i -le 30; $i++) {
        docker compose exec -T postgres pg_isready -U $pgUser -d $pgDb 2>$null | Out-Null
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
    if ($LASTEXITCODE -ne 0) { throw "Falló npm run seed:db." }

    # 4. Verificar tipos
    Write-Host ""
    Write-Host "[3/5] Verificando tipos (typecheck)..." -ForegroundColor Cyan
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "Falló npm run typecheck." }

    # 5. Construir frontend y arrancar servidor en PRIMER PLANO
    Write-Host ""
    Write-Host "[4/5] Construyendo frontend (build:web)..." -ForegroundColor Cyan
    npm run build:web
    if ($LASTEXITCODE -ne 0) { throw "Falló npm run build:web." }

    Write-Host ""
    Write-Host "[5/5] Arrancando servidor en http://127.0.0.1:8001" -ForegroundColor Cyan
    Write-Host "============================================================"
    Write-Host "  ¡Listo! Abre: http://127.0.0.1:8001" -ForegroundColor Green
    Write-Host "  Para detener: presiona Ctrl+C en esta terminal" -ForegroundColor Yellow
    Write-Host "============================================================"
    Write-Host ""

    npm start
    if ($LASTEXITCODE -ne 0) { throw "El servidor terminó con código $LASTEXITCODE." }
}
catch {
    $codigoSalida = 1
    Write-Host ""
    Write-Host "ADRIAN AI se detuvo con error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Revisa el mensaje anterior."
}
finally {
    # Evita que la ventana se cierre sin dejar ver qué pasó.
    Write-Host ""
    Read-Host "Presiona Enter para cerrar esta ventana"
}

exit $codigoSalida
