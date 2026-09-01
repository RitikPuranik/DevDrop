import api from "./axios";

export const githubAPI = {
  getStatus: () => api.get("/github/status"),
  listRepositories: (params) => api.get("/github/repositories", { params }),
  connect: () => api.post("/github/connect"),
  disconnect: () => api.delete("/github/disconnect"),
  createExport: (websiteId, payload) => api.post(`/github/export/${websiteId}`, payload),
  getExportStatus: (exportId) => api.get(`/github/exports/${exportId}`),
  getExportForWebsite: (websiteId) => api.get(`/github/exports/website/${websiteId}`),
};
