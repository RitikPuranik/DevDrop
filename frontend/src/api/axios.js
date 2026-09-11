import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
  // AI Studio can spend well over 15s generating a complete app.
  timeout: 180000,
  headers: {
    "Content-Type": "application/json",
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const code = error.response?.data?.code;
      const isDevDropAuthFailure =
        typeof code === 'string' && code.startsWith('AUTH_TOKEN_');

      if (isDevDropAuthFailure) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.dispatchEvent(new Event("auth-changed"));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
