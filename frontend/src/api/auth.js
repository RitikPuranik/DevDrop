import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api/auth"
});

export const authAPI = {

  // LOGIN
  login: (data) =>
    API.post("/login", {
      emailOrPhone: data.email,
      password: data.password
    }),

  // SIGNUP
  register: (data) =>
    API.post("/signup", {
      name: data.name,
      phone: data.phone,
      email: data.email,
      password: data.password
    }),

  // VERIFY EMAIL
  verifyEmail: (token) =>
    API.post("/verify-email", { token })

};