import api from "./axios";

export const sellerAPI = {
  submitWebsite: (data) => api.post("/seller/websites", data),
  getMyWebsites: (page = 1) => api.get(`/seller/websites?page=${page}`),
  updateWebsite: (id, data) => api.put(`/seller/websites/${id}`, data),
  deleteWebsite: (id) => api.delete(`/seller/websites/${id}`),
  getEarnings: () => api.get("/seller/earnings"),
  getPayouts: (page = 1) => api.get(`/seller/payouts?page=${page}`),
};
