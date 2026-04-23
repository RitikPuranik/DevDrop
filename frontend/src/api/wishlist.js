import api from "./axios";

export const wishlistAPI = {
  getWishlist: (page = 1) => api.get(`/wishlist?page=${page}`),
  add: (websiteId) => api.post(`/wishlist/${websiteId}`),
  remove: (websiteId) => api.delete(`/wishlist/${websiteId}`),
  check: (websiteId) => api.get(`/wishlist/check/${websiteId}`),
};
