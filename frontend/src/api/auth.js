import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api/auth"
});

export const authAPI = {

  login: (data) =>
    API.post("/login", {
      emailOrPhone: data.email,
      password: data.password
    }),

  register: (data) =>
    API.post("/signup", data)

};