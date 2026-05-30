import api from "./axios";

export const adminAPI = {
  // Websites
  createWebsite: (data) => api.post("/admin/websites", data, { headers: { "Content-Type": "multipart/form-data" } }),
  getAllWebsites: (status = 'all', page = 1) => api.get(`/admin/websites?status=${status}&page=${page}`),
  approveWebsite: (id, data) => api.post(`/admin/websites/${id}/approve`, data, { headers: { "Content-Type": "multipart/form-data" } }),
  requestChanges: (id, data) => api.put(`/admin/websites/${id}/request-changes`, data),
  rejectWebsite: (id, data) => api.put(`/admin/websites/${id}/reject`, data),
  deleteWebsite: (id) => api.delete(`/admin/websites/${id}`),
  relistWebsite: (id) => api.post(`/admin/websites/${id}/relist`),

  // Dashboard
  getDashboard: () => api.get("/admin/dashboard"),

  // Payouts
  getPendingPayouts: (page = 1) => api.get(`/admin/payouts/pending?page=${page}`),
  processPayout: (id, data) => api.post(`/admin/payouts/${id}/process`, data),
};