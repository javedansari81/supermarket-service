import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 3001 is in the API's ALLOWED_ORIGINS for local development (staff UI uses 3000)
  server: { port: 3001, strictPort: true },
  preview: { port: 3001, strictPort: true },
})
