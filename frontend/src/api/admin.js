import api from "./axios";

export const adminAPI = {
  createWebsite: (data) => api.post("/admin/websites", data, { headers: { "Content-Type": "multipart/form-data" } }),
  getPendingWebsites: (page = 1) => api.get(`/admin/websites/pending?page=${page}`),
  approveWebsite: (id, data) => api.post(`/admin/websites/${id}/approve`, data, { headers: { "Content-Type": "multipart/form-data" } }),
  requestChanges: (id, data) => api.put(`/admin/websites/${id}/request-changes`, data),
  rejectWebsite: (id, data) => api.put(`/admin/websites/${id}/reject`, data),
};