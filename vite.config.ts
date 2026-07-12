import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' — so the built version can be opened from disk or hosted on GitHub Pages
export default defineConfig({
  base: './',
  plugins: [react()],
});
