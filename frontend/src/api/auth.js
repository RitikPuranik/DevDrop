import axios from "axios";

const API = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/auth`,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authAPI = {
  login: (data) =>
    API.post("/login", {
      emailOrPhone: data.emailOrPhone,
      password: data.password,
    }),

  register: (data) =>
    API.post("/signup", {
      name: data.name,
      phone: data.phone,
      email: data.email,
      password: data.password,
    }),

  googleAuth: (credential) =>
    API.post("/google", { credential }),

  verifyEmail: (token) =>
    API.post("/verify-email", { token }),

  getMe: () =>
    API.get("/me"),

  sendVerification: () =>
    API.post("/send-verification"),

  forgotPassword: (email) =>
    API.post("/forgot-password", { email }),

  resetPassword: (token, password) =>
    API.post("/reset-password", { token, password }),
};
