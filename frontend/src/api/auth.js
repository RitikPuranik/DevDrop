import axios from "axios";

const API = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/auth`,
});

// Attach token to every request automatically
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authAPI = {

  // LOGIN — field must be `emailOrPhone`, not `email`
  login: (data) =>
    API.post("/login", {
      emailOrPhone: data.emailOrPhone,   // ✅ was data.email — caused silent undefined
      password: data.password,
    }),

  // SIGNUP
  register: (data) =>
    API.post("/signup", {
      name: data.name,
      phone: data.phone,
      email: data.email,
      password: data.password,
    }),

  // VERIFY EMAIL
  verifyEmail: (token) =>
    API.post("/verify-email", { token }),

  // GET CURRENT USER (useful for role re-check on refresh)
  getMe: () =>
    API.get("/me"),

  // SEND VERIFICATION EMAIL
  sendVerification: () =>
    API.post("/send-verification"),

  // FORGOT PASSWORD
  forgotPassword: (email) =>
    API.post("/forgot-password", { email }),

  // RESET PASSWORD
  resetPassword: (token, password) =>
    API.post("/reset-password", { token, password }),
};