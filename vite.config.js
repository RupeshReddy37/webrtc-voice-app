// vite.config.js
// ARV (Audio or Video) - React + Vite client for the existing Socket.io server.
//
// IMPORTANT: server.js is intentionally untouched. It does
//   app.use(express.static('public'))
// so we build the React app straight into `public/`. `npm start`
// (node server.js) therefore serves the finished SPA exactly like
// it served the old static files, and `npm run dev` proxies
// Socket.io traffic to the backend on :3000.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // We build into the folder express already serves; there is no
  // separate Vite "public" asset directory to copy from.
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Forward Socket.io (polling + WebSocket upgrade) to the signaling server
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
