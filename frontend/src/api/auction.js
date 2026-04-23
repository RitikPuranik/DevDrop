import api from "./axios";

export const auctionAPI = {
  getActive: (page = 1) => api.get(`/auctions?page=${page}`),
  getAuction: (id) => api.get(`/auctions/${id}`),
  placeBid: (id, bidAmount) => api.post(`/auctions/${id}/bid`, { bidAmount }),
  getMyBids: (id) => api.get(`/auctions/${id}/bids`),
};
