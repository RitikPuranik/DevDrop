import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api/contact"
});

export const contactAPI = {
  // Submit a contact-us enquiry
  submit: (data) =>
    API.post("/", {
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message || "",
    }),
};
