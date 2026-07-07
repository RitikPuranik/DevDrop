import api from "./axios";

export const paymentAPI = {
  quoteOrder: (data) => {
    return api.post("/payment/quote", data);
  },

  createOrder: (data) => {
    return api.post("/payment/create-order", data);
  },

  verifyPayment: (data) => {
    return api.post("/payment/verify", data);
  }

};
