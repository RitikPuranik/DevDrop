import api from "./axios";

export const deploymentAPI = {
  // Connected accounts
  getProviders: () => api.get("/deployments/providers"),
  connectVercel: () => api.post("/deployments/providers/vercel/connect"),
  finishConnectVercel: (code, teamId, configurationId, state) => api.post("/deployments/providers/vercel/finish-connect", { code, teamId, configurationId, state }),
  disconnectVercel: () => api.delete("/deployments/providers/vercel/disconnect"),
  connectRender: (apiKey) => api.post("/deployments/providers/render/connect", { apiKey }),
  setRenderOwner: (ownerId) => api.patch("/deployments/providers/render/owner", { ownerId }),
  disconnectRender: () => api.delete("/deployments/providers/render/disconnect"),

  // Analysis + deployment lifecycle
  analyze: (websiteId, repository) => api.post(`/deployments/analyze/${websiteId}`, { repository }),
  create: (websiteId, envValues, repository) => api.post(`/deployments/${websiteId}`, { envValues, repository }),

  // Personal projects — the user's own GitHub repo, deployed with no
  // DevDrop purchase involved at all.
  analyzePersonal: (repository) => api.post("/deployments/personal/analyze", { repository }),
  createPersonal: (repository, envValues) => api.post("/deployments/personal", { repository, envValues }),

  list: (params) => api.get("/deployments", { params }),
  getForWebsite: (websiteId) => api.get(`/deployments/website/${websiteId}`),
  getById: (deploymentId) => api.get(`/deployments/${deploymentId}`),
  redeploy: (deploymentId) => api.post(`/deployments/${deploymentId}/redeploy`),
  cancel: (deploymentId) => api.post(`/deployments/${deploymentId}/cancel`),

  // Version history, rollback and logs. :deploymentId is the DevDrop site record;
  // the backend resolves Vercel ids itself and re-checks ownership on every call.
  listVersions: (deploymentId, params) => api.get(`/deployments/${deploymentId}/versions`, { params }),
  syncVersions: (deploymentId) => api.post(`/deployments/${deploymentId}/versions/sync`),
  getVersion: (deploymentId, versionId) => api.get(`/deployments/${deploymentId}/versions/${versionId}`),
  rollbackCheck: (deploymentId, versionId) => api.get(`/deployments/${deploymentId}/versions/${versionId}/rollback-check`),
  rollback: (deploymentId, versionId, idempotencyKey) =>
    api.post(`/deployments/${deploymentId}/rollback`, { versionId, confirm: true, idempotencyKey }),
  getRollback: (deploymentId, operationId) => api.get(`/deployments/${deploymentId}/rollback/${operationId}`),
  retryRollback: (deploymentId, operationId) => api.post(`/deployments/${deploymentId}/rollback/${operationId}/retry`),
  versionLogs: (deploymentId, versionId, params) => api.get(`/deployments/${deploymentId}/versions/${versionId}/logs`, { params }),
};
