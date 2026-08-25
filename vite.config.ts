import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/shanjian-lushan-platform/' : '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', 'zustand'],
          mapbox: ['mapbox-gl'],
        },
      },
    },
  },
});
