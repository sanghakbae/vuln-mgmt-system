import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 배포 대상 판단
const isGithub = process.env.VITE_DEPLOY_TARGET === "github";

export default defineConfig({
   plugins: [react()],
   base: isGithub ? "/vuln-mgmt-system/" : "/",
});
