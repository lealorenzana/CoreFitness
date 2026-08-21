/**
 * Runs the admin dashboard as a desktop app on the front-desk laptop.
 *
 * The admin app is deliberately not deployed — it is a desk tool for one
 * machine, and leaving it off the public internet is the point (see
 * docs/DEPLOYMENT.md). But "not deployed" had come to mean "open a terminal,
 * remember the npm incantation, then find the tab", which is not something to
 * be doing in front of a panel, let alone every morning at a gym.
 *
 * So: a desktop icon that opens a window. No terminal, no address bar, no tabs.
 *
 * ## Why a server at all, rather than opening dist/index.html
 *
 * The dashboard is a single-page app with client-side routing and ES modules.
 * Over `file://` the module imports are blocked as cross-origin and every route
 * below `/` 404s, so the page loads to a blank screen. It needs an HTTP origin,
 * and this is the smallest one that does the job — Node's own http module,
 * nothing installed.
 *
 * ## Why the browser gets its own profile
 *
 * `--app` alone hands the URL to whatever browser window is already open, which
 * returns immediately and leaves this server running forever with nothing to
 * shut it down. `--user-data-dir` forces a separate browser process whose
 * lifetime *is* the window's, so closing the window closes the app: the child
 * exits, this process exits, the port is released.
 *
 * It also gives the dashboard its own storage. The admin's Supabase session
 * lives in that profile rather than in the personal browser, which is the
 * honest arrangement for a shared desk machine — and it means signing out of
 * the gym system does not sign anybody out of anything else.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, sep } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'dist');
const PORT = 5174;
const URL_ = `http://localhost:${PORT}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json; charset=utf-8',
};

/** Where the app's own browser profile lives. Survives restarts, so the desk stays signed in. */
const PROFILE = join(tmpdir(), 'corefitness-admin-profile');

/**
 * Forward slashes, deliberately. Windows accepts them everywhere Node passes a
 * path to the OS, and a literal `C:\Program` in a JS string is a trap: `\P` is
 * not an escape sequence, so the backslash is silently dropped and the path
 * becomes `C:Program Files...`. That is exactly how this shipped the first
 * time — `existsSync` answered false for a browser sitting right there, and the
 * icon started a server that opened no window.
 */
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

function findBrowser() {
  return BROWSERS.find((p) => existsSync(p)) ?? null;
}

/**
 * Resolve a request path to a file inside dist, or null.
 *
 * The `startsWith(ROOT)` check is not ceremony: without it, a request for
 * `/../../.env.local` walks straight out of dist and serves the Supabase keys
 * over HTTP. Localhost-only is not a reason to skip it — anything running on
 * this machine, including a web page in another browser tab, can reach it.
 */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = normalize(join(ROOT, decoded));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  const file = resolveFile(req.url ?? '/');
  if (!file) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  // A real file wins. Anything else is a client-side route and gets index.html
  // — the same catch-all the member app's vercel.json uses.
  let served = file;
  try {
    await access(served);
    if (!extname(served)) throw new Error('directory or extensionless');
  } catch {
    served = join(ROOT, 'index.html');
  }

  try {
    const body = await readFile(served);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(served).toLowerCase()] ?? 'application/octet-stream',
      // Hashed asset names make these safe to cache; index.html must not be.
      'Cache-Control': served.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000',
    }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

function openWindow() {
  const browser = findBrowser();
  if (!browser) {
    // No Edge and no Chrome. Fall back to whatever handles http:// rather than
    // failing — a normal browser tab is worse than an app window, but it is a
    // great deal better than an icon that appears to do nothing.
    spawn('cmd', ['/c', 'start', '', URL_], { detached: true, stdio: 'ignore' }).unref();
    return null;
  }
  const child = spawn(browser, [
    `--app=${URL_}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { stdio: 'ignore' });
  return child;
}

async function main() {
  if (!existsSync(join(ROOT, 'index.html'))) {
    // Nothing to serve. Say so in a way that is visible from a double-clicked
    // icon, where stdout goes nowhere.
    spawn('mshta', [
      // `\\n` and not a real newline: this string is JavaScript *source* handed
      // to mshta, and a literal line break inside a JS string is a syntax error
      // — the dialog would simply never appear.
      'javascript:alert("Core Fitness Admin has not been built yet.\\n\\n'
      + 'Open a terminal in g-fitness-admin and run:\\n\\n    npm run build\\n\\n'
      + 'Then use the shortcut again.");close();',
    ], { detached: true, stdio: 'ignore' }).unref();
    process.exit(1);
  }

  server.on('error', (err) => {
    // Already serving on this port — almost always a second double-click, or
    // `npm run dev` already running. Either way the dashboard is up: just show
    // it, and leave the process that owns the port alone.
    if (err.code === 'EADDRINUSE') {
      openWindow();
      setTimeout(() => process.exit(0), 1500);
      return;
    }
    throw err;
  });

  server.listen(PORT, '127.0.0.1', () => {
    const child = openWindow();
    // The window is the app. When it closes, so does this.
    child?.on('exit', () => process.exit(0));
  });
}

main();
