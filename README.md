# OZAIBOT - Multi-Tenant AI Backend

## 🚀 Deployment: Railway

### Prerequisites
1.  **PostgreSQL 16+** Service
2.  **Redis 7+** Service

### Steps
1.  **Connect Repo:** Connect this repository to Railway.
2.  **Add Services:** ensure a Postgres and Redis service are active.
3.  **Variables:** Copy contents of `.env.example` to the Railway Service "Variables" tab.
    * *Link* the Postgres variables (`DB_HOST`, `DB_PASSWORD`, etc) using Railway's variable reference system (e.g., `${{Postgres.HOST}}`).
    * *Link* the Redis variables.
4.  **Deploy:** Trigger the deployment.
5.  **Verify:** Check the "Deploy Logs". Look for:
    * `✅ Listening on 0.0.0.0:3000`
    * `[TypeOrmModule] Dependencies initialized`

## ⚠️ Troubleshooting
* **Health Check Fail:** If `/health/liveness` fails, check if the migrations ran.
* **Migrations:** The container attempts to run migrations on boot via the separate `migrate` service in `docker-compose`, but on Railway single-service deployment, you might need to run `npm run typeorm:migration:run:ts` manually or add it to the start command if you aren't using the multi-container setup.