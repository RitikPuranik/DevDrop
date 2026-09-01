import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: true,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  }
});

// Auto-attach JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally (expired/invalid token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // A 401 can come from a third-party provider (for example GitHub
      // returning 401 because its OAuth token was revoked). That must NOT
      // log the user out of DevDrop. Only the backend auth middleware marks
      // a response with an AUTH_TOKEN_* code as proof that the DevDrop JWT
      // itself is invalid/expired.
      const code = error.response?.data?.code;
      const isDevDropAuthFailure = typeof code === 'string' && code.startsWith('AUTH_TOKEN_');
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
