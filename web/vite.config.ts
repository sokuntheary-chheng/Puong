import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

/**
 * The one piece of development plumbing the M3 client needs: `/api` on the
 * dev server must reach the API.
 *
 * A proxy rather than `fetch('http://localhost:3000/...')`, for two reasons
 * that are really one:
 *
 * 1. **Same origin.** The session is an `httpOnly`, `SameSite=Strict`
 *    cookie. `Strict` cookies are not sent to `localhost:3000` when the page
 *    is `localhost:5173` — they are a different site by origin — so a direct
 *    call would arrive without a session and answer 401. Through the proxy
 *    the browser only ever talks to one origin, exactly as it does behind
 *    nginx in production, and the code never learns that a proxy exists.
 * 2. **`changeOrigin: false`** (the default, stated because it matters):
 *    the request keeps `Host: localhost:5173` and `Origin:
 *    http://localhost:5173`, which is the pair the API compares on unsafe
 *    methods. Rewriting the host would make the two disagree and every POST
 *    would be refused as cross-site.
 *
 * The target is overridable for a stack running somewhere else (the Docker
 * compose file, for instance).
 */
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
});
