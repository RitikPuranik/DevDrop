import React from "react";
import { Toaster } from "react-hot-toast";
import BuilderLayout from "./components/builder/BuilderLayout.jsx";
import "./index.css";

/**
 * WebCraft App
 *
 * This component renders the full-screen website builder.
 * It is intentionally a STANDALONE full-viewport component —
 * it should NOT be rendered inside any parent layout that has
 * its own navbar, sidebar, or scroll wrapper.
 *
 * ── How to use in your devdrop project ──────────────────────
 *
 * In your devdrop router (e.g. App.jsx or router.jsx), add:
 *
 *   import WebcraftApp from "./pages/webcraft/src/App.jsx";
 *
 *   // Add this route — OUTSIDE any layout that renders the devdrop shell:
 *   <Route path="/builder" element={<WebcraftApp />} />
 *
 * If your devdrop router wraps all routes in a <Layout> component
 * that renders the devdrop navbar, use a separate route group:
 *
 *   // Routes WITHOUT devdrop shell:
 *   <Route path="/builder" element={<WebcraftApp />} />
 *
 *   // Routes WITH devdrop shell:
 *   <Route element={<DevdropLayout />}>
 *     <Route path="/" element={<Home />} />
 *     ...
 *   </Route>
 *
 * ──────────────────────────────────────────────────────────────
 */
export default function App() {
  return (
    <>
      <BuilderLayout />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#1a1a22",
            color: "#fff",
            border: "1px solid #2a2a38",
            fontFamily: "'Inter', sans-serif",
            fontSize: "13px",
          },
          success: { iconTheme: { primary: "#6366f1", secondary: "#fff" } },
        }}
      />
    </>
  );
}
