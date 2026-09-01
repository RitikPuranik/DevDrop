import api from "./axios";

export const deploymentAPI = {
  // Connected accounts
  getProviders: () => api.get("/deployments/providers"),
  connectVercel: () => api.post("/deployments/providers/vercel/connect"),
  finishConnectVercel: (code, teamId) => api.post("/deployments/providers/vercel/finish-connect", { code, teamId }),
  disconnectVercel: () => api.delete("/deployments/providers/vercel/disconnect"),
  connectRender: (apiKey) => api.post("/deployments/providers/render/connect", { apiKey }),
  setRenderOwner: (ownerId) => api.patch("/deployments/providers/render/owner", { ownerId }),
  disconnectRender: () => api.delete("/deployments/providers/render/disconnect"),

  // Analysis + deployment lifecycle
  analyze: (websiteId) => api.post(`/deployments/analyze/${websiteId}`),
  create: (websiteId, envValues) => api.post(`/deployments/${websiteId}`, { envValues }),
  list: (params) => api.get("/deployments", { params }),
  getForWebsite: (websiteId) => api.get(`/deployments/website/${websiteId}`),
  getById: (deploymentId) => api.get(`/deployments/${deploymentId}`),
  redeploy: (deploymentId) => api.post(`/deployments/${deploymentId}/redeploy`),
  cancel: (deploymentId) => api.post(`/deployments/${deploymentId}/cancel`),
};
