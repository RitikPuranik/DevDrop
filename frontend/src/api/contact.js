import axios from "axios";

const API = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/contact`
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
