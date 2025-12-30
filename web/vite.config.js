// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This allows the 192.168.0.14 access
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000', // Use IP, not 'localhost'
        changeOrigin: true,
        secure: false,
        // Add this to verify the proxy is trying to connect
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
        },
      },
    },
  },
});


