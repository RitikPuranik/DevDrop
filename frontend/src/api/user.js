import api from "./axios";

export const userAPI = {

  getUser: () => {
    return api.get("/user/me");
  },

  updateUser: (data) => {
    return api.put("/user/update", data);
  }

};