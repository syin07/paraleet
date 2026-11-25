import type { Plugin } from 'vite';

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'";

/**
 * Adds a strict Content-Security-Policy to the built renderer. It is skipped in dev because the
 * Vite dev server needs inline scripts and a websocket for hot reload.
 */
export function productionCsp(): Plugin {
  return {
    name: 'paraleet-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

/**
 * The port for the browser-only UI server (`npm run dev:ui` and the Playwright UI tests).
 * The main checkout uses 5199. A git worktree gets its own port, derived from its path, so
 * several agents can run UI tests at once without sharing one server. Override with
 * PARALEET_UI_PORT.
 */
export function uiPort(): number {
  const override = Number(process.env.PARALEET_UI_PORT);
  if (Number.isInteger(override) && override > 0) return override;
  const cwd = process.cwd();
  if (!cwd.includes('worktrees')) return 5199;
  let hash = 0;
  for (const char of cwd) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 5200 + (hash % 700);
}
