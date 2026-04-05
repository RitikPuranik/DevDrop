import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// This main.jsx is used when running WebCraft as a standalone app (npm run dev).
// When embedded in devdrop, import App.jsx directly in your router instead.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
