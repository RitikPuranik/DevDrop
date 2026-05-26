import api from "./axios";

export const auctionAPI = {
  getActive: (page = 1) => api.get(`/auctions?page=${page}`),
  // Backend uses websiteId for getAuction and placeBid
  getByWebsite: (websiteId) => api.get(`/auctions/${websiteId}`),
  placeBid: (websiteId, bidAmount) => api.post(`/auctions/${websiteId}/bid`, { bidAmount }),
  // getMyBids requires auth — uses req.userId on backend
  getMyBids: (page = 1) => api.get(`/auctions/my/bids?page=${page}`),
};
