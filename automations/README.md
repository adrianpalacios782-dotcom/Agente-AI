# Automatizaciones externas con n8n (Fase 4 — ADRIAN AI)

n8n corre **self-hosted en Docker** restringido exclusivamente a `127.0.0.1:5678` (nunca expuesto a la red local).

## 1. Configurar token compartido en `D:\adrian-ai\.env`
Genera un token aleatorio (mínimo 24 caracteres) y colócalo en `.env`:
```dotenv
ADRIAN_AUTOMATION_TOKEN=tu_token_secreto_largo_aqui
N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook
```

## 2. Levantar n8n junto con PostgreSQL
```powershell
cd D:\adrian-ai
docker compose --profile automation up -d
```
Luego abre `http://127.0.0.1:5678` y crea tu cuenta local de n8n.

## 3. Importar los flujos listos
En n8n → **Workflows → Import from File**, importa:
1. `automations/n8n/01_resumen_semanal_proyectos.json`: todos los lunes a las 08:30 (hora Tarija) consulta `GET http://host.docker.internal:8001/api/automation/digest` con `X-Adrian-Automation-Token` y prepara tu reporte semanal (listo para conectar a Gmail, Telegram o WhatsApp).
2. `automations/n8n/02_webhook_entregable_aprobado.json`: recibe entregables disparados desde ADRIAN AI (`trigger_n8n_webhook`) **únicamente tras tu aprobación HITL**.
