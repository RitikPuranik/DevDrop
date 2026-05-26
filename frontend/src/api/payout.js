import api from "./axios";

export const payoutAPI = {
  // Seller earnings are on /seller/earnings
  getEarnings: () => api.get("/seller/earnings"),
  // Seller payouts are on /seller/payouts
  getPayouts: (page = 1) => api.get(`/seller/payouts?page=${page}`),
};
