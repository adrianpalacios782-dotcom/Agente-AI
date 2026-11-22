#!/usr/bin/env bash
# ==============================================================================
# ADRIAN AI — Levantar todo el entorno (BIMCAT S.R.L.)
# Ejecuta desde la raíz del repo: ./scripts/levantar.sh
# Queda en PRIMER PLANO: presiona Ctrl+C para detener el servidor.
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "============================================================"
echo "  ADRIAN AI — Levantando entorno completo"
echo "  Directorio: $ROOT_DIR"
echo "============================================================"

# 1. Verificar .env
if [ ! -f .env ]; then
  echo "ERROR: No existe .env. Copia .env.example a .env y pega tu GOOGLE_GENAI_API_KEY."
  exit 1
fi

if ! grep -q "GOOGLE_GENAI_API_KEY=" .env || grep -q "GOOGLE_GENAI_API_KEY=$" .env || grep -q "GOOGLE_GENAI_API_KEY=pega_aqui_tu_api_key" .env; then
  echo "ERROR: Configura GOOGLE_GENAI_API_KEY en .env antes de continuar."
  exit 1
fi

# 2. Levantar Docker (PostgreSQL 16 + pgvector)
echo ""
echo "[1/5] Levantando PostgreSQL + pgvector (Docker)..."
docker compose up -d

echo "Esperando a que PostgreSQL esté listo..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-adrian}" -d "${POSTGRES_DB:-adrian_ai}" >/dev/null 2>&1; then
    echo "  PostgreSQL listo."
    break
  fi
  sleep 2
  if [ "$i" -eq 30 ]; then
    echo "  Advertencia: PostgreSQL no respondió a tiempo, pero se continua."
  fi
done

# 3. Poblar base de datos
echo ""
echo "[2/5] Poblando memoria y proyectos en PostgreSQL..."
npm run seed:db

# 4. Verificar tipos
echo ""
echo "[3/5] Verificando tipos (typecheck)..."
npm run typecheck

# 5. Construir frontend y arrancar servidor en PRIMER PLANO
echo ""
echo "[4/5] Construyendo frontend (build:web)..."
npm run build:web

echo ""
echo "[5/5] Arrancando servidor en http://127.0.0.1:8001"
echo "============================================================"
echo "  ¡Listo! Abre: http://127.0.0.1:8001"
echo "  Para detener: presiona Ctrl+C en esta terminal"
echo "============================================================"
echo ""

npm start
