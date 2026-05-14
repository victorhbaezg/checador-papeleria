import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Checador Papeleria",
        short_name: "Checador",
        description: "Control de asistencia y nomina",
        theme_color: "#2563eb",
        background_color: "#f8fafc",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes("supabase.co"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-cache",
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
});
