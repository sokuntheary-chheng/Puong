import { defineConfig, devices } from '@playwright/test';

/**
 * The M4 browser walkthrough.
 *
 * Deliberately *not* part of `api` or `web`: this folder owns the tooling
 * that looks at the running application, and neither service should carry a
 * browser in its dependencies to do its own job. `api` keeps the Jest e2e
 * suite it has always had; `web` keeps `npm run check`. This runs the
 * stories a person would run, and writes the screenshots `docs/stories-m4.md`
 * points at.
 *
 * Both servers must already be up — the API on :3000 and `npm run dev` on
 * :5173 (which proxies `/api` to it, the same origin the browser would use
 * in production). No `webServer` block here on purpose: starting a stack is
 * `docker compose up`'s job, and a test that silently starts a second API
 * on top of a running one is a test that sometimes talks to the wrong
 * database.
 *
 * `E2E_BASE_URL` points the same stories at any other running stack — the
 * containerised one (`http://localhost:8080`) being the case M5 cares about:
 * what is tested then is the nginx build, the proxy and the API image, not
 * the dev servers.
 */
export default defineConfig({
  testDir: './tests',
  /* Stories build on each other — story 5 links the person story 4 added —
     so they run in order, one at a time, exactly as a demo would. */
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'en-GB',
    timezoneId: 'Asia/Phnom_Penh',
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
