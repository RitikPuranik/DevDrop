/**
 * Template.jsx  —  devdrop page that renders WebCraft full-screen
 *
 * Place this file at:
 *   frontend/src/pages/Template.jsx   (or wherever your devdrop pages live)
 *
 * Then in your devdrop router/App.jsx, add:
 *   import Template from "./pages/Template";
 *   <Route path="/builder" element={<Template />} />
 *
 * IMPORTANT: This route must be OUTSIDE any layout wrapper
 * that renders the devdrop navbar/sidebar.
 */

import React from "react";
import WebcraftApp from "./webcraft/src/App.jsx";

export default function Template() {
  return <WebcraftApp />;
}
