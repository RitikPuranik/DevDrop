import api from "./axios";

// All calls go through the DevDrop backend (never directly to the Genie
// microservice) — the backend is the trusted boundary that attaches the
// service-to-service auth header and enforces job ownership.
export const aiStudioAPI = {
  generatePortfolio: (payload) => api.post("/ai/generation/portfolio", payload),
  getJobStatus: (jobId) => api.get(`/ai/generation/jobs/${jobId}`),
  getJobFiles: (jobId) => api.get(`/ai/generation/jobs/${jobId}/files`),
  retryJob: (jobId) => api.post(`/ai/generation/jobs/${jobId}/retry`),
  modifyJob: (jobId, message) => api.post(`/ai/generation/jobs/${jobId}/modify`, { message }),
  getModifyStatus: (jobId, chatJobId) => api.get(`/ai/generation/jobs/${jobId}/modify/${chatJobId}`),
  undoLastChange: (jobId) => api.post(`/ai/generation/jobs/${jobId}/undo`),
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
