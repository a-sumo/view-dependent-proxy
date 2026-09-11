import {defineConfig} from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/view-dependent-proxy/' : '/',
  build: {
    target: 'esnext',
  },
});
