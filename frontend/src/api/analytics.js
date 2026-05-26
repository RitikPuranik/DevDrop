import api from "./axios";

export const analyticsAPI = {
  getPublicStats: () => api.get("/analytics/public-stats"),
  getPlatformStats: () => api.get("/analytics/platform"),
};
