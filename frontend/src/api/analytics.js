import api from './axios';

export const analyticsAPI = {
  getPublicStats: () => api.get('/analytics/public-stats'),
  getPlatformStats: () => api.get('/analytics/platform'),
  getActivityHeatmap: (days = 30) => api.get(`/analytics/activity/heatmap?days=${days}`),
  sendActivityHeartbeat: (payload) => api.post('/analytics/activity/heartbeat', payload),
};
