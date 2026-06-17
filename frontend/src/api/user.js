import api from "./axios";

export const userAPI = {
  getProfile: () => api.get("/user/profile"),
  getDashboard: () => api.get("/user/dashboard"),
  getPurchases: (page = 1) => api.get(`/user/purchases?page=${page}`),
  getBankDetails: () => api.get("/user/bank-details"),
  saveBankDetails: (data) => api.post("/user/bank-details", data),
  updateAvatar: (formData) => api.put("/user/profile/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),
  removeAvatar: () => api.delete("/user/profile/avatar"),
};