import api from "./axios";

export const buyerAPI = {
  purchaseFree: (websiteId) => api.post(`/buyer/purchase/${websiteId}`),
  checkPurchase: (websiteId) => api.get(`/buyer/check-purchase/${websiteId}`),
  getMyPurchases: (page = 1) => api.get(`/buyer/my-purchases?page=${page}`),
  getPurchaseDetails: (purchaseId) => api.get(`/buyer/my-purchases/${purchaseId}`),
};
