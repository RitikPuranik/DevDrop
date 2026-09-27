import api from "./axios";

export const aiStudioAPI = {
  openSession: (sessionId, projectId, websiteType) =>
    api.post("/ai-studio/session", { sessionId, projectId, websiteType }),
  heartbeat: (projectId, sessionId) =>
    api.post(`/ai-studio/${projectId}/heartbeat`, { sessionId }),
  recordActivity: (projectId) => api.post(`/ai-studio/${projectId}/activity`),
  sync: (projectId, { files, dependencies, title }) =>
    api.post(`/ai-studio/${projectId}/sync`, { files, dependencies, title }),
  download: (projectId) => api.get(`/ai-studio/${projectId}/download`),
  uploadAsset: (projectId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post(`/ai-studio/${projectId}/assets`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteAsset: (projectId, assetId) => api.delete(`/ai-studio/${projectId}/assets/${assetId}`),
  closeTab: (projectId, sessionId) => api.post(`/ai-studio/${projectId}/close`, { sessionId }),
};
