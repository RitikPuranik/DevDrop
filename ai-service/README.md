# DevDrop AI Service

Standalone AI worker for AI Studio. The main backend only queues a job and polls this service, so long Gemini requests do not keep `/api/ai-generate` open.

## Local development

```powershell
cd ai-service
npm install
copy .env.example .env
npm start
```

Set `GEMINI_API_KEY` and make `SERVICE_API_KEY` match `AI_SERVICE_TOKEN` in `backend/.env`.

The service listens on `http://localhost:3001` by default.

### Endpoints

- `GET /health`
- `POST /jobs` creates an asynchronous generation job and returns `202` with `jobId`.
- `GET /jobs/:id` returns `queued`, `processing`, `completed`, or `failed`.

This first version uses an in-memory job store for simple local development. For production, replace the job Map with Redis/BullMQ or another durable queue/store so jobs survive process restarts and can be handled by multiple workers.
