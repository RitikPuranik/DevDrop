import api from "./axios";

// Generation runs the full AI pipeline (planning + codegen + sandboxed
// build) synchronously on the server before responding — it can take
// several minutes, not the 15s default set in axios.js for ordinary
// requests. Override just these two calls so the browser doesn't cancel
// the request while the AI service is still legitimately working.
const GENERATION_TIMEOUT_MS = 620_000; // 10 minutes + buffer

// All calls go through the DevDrop backend (never directly to the AI
// service) — the backend is the trusted boundary that attaches the
// AI-service auth header and enforces job ownership.
export const aiStudioAPI = {
  generatePortfolio: (payload) =>
    api.post("/ai/generation/portfolio", payload, { timeout: GENERATION_TIMEOUT_MS }),
  getJobStatus: (jobId) => api.get(`/ai/generation/jobs/${jobId}`),
  retryJob: (jobId) =>
    api.post(`/ai/generation/jobs/${jobId}/retry`, undefined, { timeout: GENERATION_TIMEOUT_MS }),
  uploadAsset: (file, type, onUploadProgress) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    return api.post("/ai/assets", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    });
  },
};