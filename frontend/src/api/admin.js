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

  // Coupons
  getCoupons: () => api.get("/admin/coupons"),
  createCoupon: (data) => api.post("/admin/coupons", data),
  toggleCoupon: (id, data = {}) => api.patch(`/admin/coupons/${id}/toggle`, data),

  // Payouts
  getPendingPayouts: (page = 1) => api.get(`/admin/payouts/pending?page=${page}`),
  processPayout: (id, data) => api.post(`/admin/payouts/${id}/process`, data),

  // Backup & Restore
  getBackupStatus: () => api.get("/admin/backup/status"),
  getBackupHistory: (limit = 10, page = 1, { type, from, to } = {}) => {
    const params = new URLSearchParams({ limit, page });
    if (type) params.append('type', type);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    return api.get(`/admin/backup/history?${params.toString()}`);
  },
  backupMongo: (direction, mode = "replace") => api.post("/admin/backup/mongo", { direction, mode }),
  backupSupabase: (direction, supabaseMode = "mirror") => api.post("/admin/backup/supabase", { direction, supabaseMode }),
  backupFull: (direction, mode = "replace", supabaseMode = "mirror") => api.post("/admin/backup/full", { direction, mode, supabaseMode }),
};
