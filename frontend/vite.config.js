import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Fixed host+port so it always matches the redirect URI registered with
    // Spotify (Spotify requires the literal 127.0.0.1 loopback address, not
    // the "localhost" hostname, and won't accept a drifted port either).
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
