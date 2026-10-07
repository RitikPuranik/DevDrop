import api from "./axios";

export const kashiAPI = {
  chat: ({ message, history, context }) => api.post("/kashi/chat", { message, history, context }, { timeout: 45000 }),
  startFix: (deploymentId) => api.post(`/kashi/deployments/${deploymentId}/fix`),
  getRun: (runId) => api.get(`/kashi/fix-runs/${runId}`),
  getLatestRun: (deploymentId) => api.get(`/kashi/deployments/${deploymentId}/fix-runs/latest`),
  cancelRun: (runId) => api.post(`/kashi/fix-runs/${runId}/cancel`),
};
