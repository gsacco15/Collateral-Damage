import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Link previews need an absolute image URL. On Vercel, use the production domain (or this deployment's);
// SITE_URL overrides both. Locally it stays relative.
const env = process.env;
const site = env.SITE_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '');

export default defineConfig({
  plugins: [react(), { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('%SITE%', site.replace(/\/$/, '')) }],
  worker: { format: 'es' },
});
