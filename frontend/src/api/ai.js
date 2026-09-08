import api from "./axios";

// All calls go through the DevDrop backend (never directly to the AI
// service) — the backend is the trusted boundary that attaches the
// AI-service auth header and enforces job ownership.
export const aiStudioAPI = {
  generatePortfolio: (payload) => api.post("/ai/generation/portfolio", payload),
  getJobStatus: (jobId) => api.get(`/ai/generation/jobs/${jobId}`),
  retryJob: (jobId) => api.post(`/ai/generation/jobs/${jobId}/retry`),
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
