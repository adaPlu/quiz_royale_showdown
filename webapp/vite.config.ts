import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const nativeBuildSha =
  process.env.VITE_BUILD_SHA?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  "unknown";
process.env.VITE_BUILD_SHA = nativeBuildSha;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@components": path.resolve(__dirname, "src/components"),
      "@hooks": path.resolve(__dirname, "src/hooks"),
      "@pages": path.resolve(__dirname, "src/pages"),
      "@services": path.resolve(__dirname, "src/services"),
      "@stores": path.resolve(__dirname, "src/stores"),
      "@hookform/resolvers": path.resolve(__dirname, "../node_modules/@hookform/resolvers"),
      "react-hook-form": path.resolve(__dirname, "../node_modules/react-hook-form"),
      "react-router-dom": path.resolve(__dirname, "../node_modules/react-router-dom"),
      "react-dom": path.resolve(__dirname, "../node_modules/react-dom"),
      react: path.resolve(__dirname, "../node_modules/react"),
      zod: path.resolve(__dirname, "../node_modules/zod"),
      zustand: path.resolve(__dirname, "../node_modules/zustand"),
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) {
            return "react";
          }

          if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) {
            return "motion";
          }

          if (/[\\/]node_modules[\\/](socket\.io-client|zustand|axios|zod)[\\/]/.test(id)) {
            return "socket";
          }

          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
