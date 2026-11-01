import api from "./axios";

// Every price, limit and entitlement shown in the UI comes from these endpoints. Requests carry only
// ids (plan, interval, coupon code); amounts are never sent.
export const billingAPI = {
  plans: () => api.get("/billing/plans"),
  subscription: () => api.get("/billing/subscription"),
  usage: () => api.get("/billing/usage"),
  orders: () => api.get("/billing/orders"),
  quote: (planId, interval) => api.post("/billing/quote", { planId, interval }),
  validateCoupon: (planId, interval, code) => api.post("/billing/coupons/validate", { planId, interval, code }),
  checkout: (planId, interval, couponCode) => api.post("/billing/checkout", { planId, interval, couponCode: couponCode || undefined }),
  verify: (payload) => api.post("/billing/checkout/verify", payload),
  checkoutStatus: (orderId) => api.get(`/billing/checkout/${orderId}/status`),
  cancel: () => api.post("/billing/subscription/cancel"),
  resume: () => api.post("/billing/subscription/resume"),
};
