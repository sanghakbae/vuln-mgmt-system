import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths work on both the GitHub Pages project URL
  // and the custom domain root without rebuilding per host.
  base: "./",
});
