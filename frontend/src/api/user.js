import api from "./axios";

export const userAPI = {
  getProfile: () => api.get("/user/profile"),
  getDashboard: () => api.get("/user/dashboard"),
  getPurchases: (page = 1) => api.get(`/user/purchases?page=${page}`),
  getBankDetails: () => api.get("/user/bank-details"),
  saveBankDetails: (data) => api.post("/user/bank-details", data),
};