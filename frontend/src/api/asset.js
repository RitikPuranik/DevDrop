import api from "./axios";

export const assetAPI = {
  getAssetUrls: (websiteId) => api.get(`/assets/download/${websiteId}`),
  getPreviewUrl: (websiteId) => api.get(`/assets/preview/${websiteId}`),
  getDownloadHistory: (page = 1) => api.get(`/assets/history?page=${page}`),
};
