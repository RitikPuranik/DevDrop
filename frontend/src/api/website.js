import api from "./axios";

export const websiteAPI = {

  getAll: () => {
    return api.get("/websites");
  },

  getById: (id) => {
    return api.get(`/websites/${id}`);
  },

  create: (data) => {
    return api.post("/websites", data);
  },

  update: (id, data) => {
    return api.put(`/websites/${id}`, data);
  },

  delete: (id) => {
    return api.delete(`/websites/${id}`);
  }

};