import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/graph-topology-editor/', // The base path where your app will be deployed
});
