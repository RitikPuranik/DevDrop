import api from "./axios";

export const paymentAPI = {

  createOrder: (data) => {
    return api.post("/payment/create-order", data);
  },

  verifyPayment: (data) => {
    return api.post("/payment/verify", data);
  }

};