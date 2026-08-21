# Core Fitness Admin — desktop launcher

Turns the admin dashboard into something you open from a desktop icon: one
window, no terminal, no address bar, no tabs.

The admin app is deliberately **not deployed** — it is a front-desk tool for one
laptop, and keeping it off the public internet is the point (see
[DEPLOYMENT](../../docs/DEPLOYMENT.md)). This gives it the convenience of an
installed app without giving it a public URL.

## Install (once per machine)

```powershell
cd g-fitness-admin; npm install; npm run build; .\desktop\install-shortcut.ps1
```

That builds the app, generates the icon, and puts **Core Fitness Admin** on the
Desktop and in the Start menu. Re-running it is safe.

After changing admin code, run `npm run build` again — the launcher serves
`dist/`, not the dev server, so an unbuilt change will not appear.

## What the pieces do

| File | Role |
|---|---|
| `serve.mjs` | Serves `dist/` on `localhost:5174` and opens the app window. All the behaviour is here. |
| `launch.vbs` | Starts `serve.mjs` with the console window hidden. This is what the shortcut runs. |
| `make-icon.ps1` | Builds a 6-size `.ico` from `public/core-fitness-logo.png`. |
| `install-shortcut.ps1` | Creates the two shortcuts. Calls `make-icon.ps1` if the icon is missing. |

No new npm packages, no Electron, no Rust toolchain — just Node, which is
already required to build the app, and a browser, which is already installed.

## Four things that are not obvious

**It needs an HTTP origin, so there is a server.** Opening `dist/index.html`
directly over `file://` gives a blank screen: the ES module imports are blocked
as cross-origin and every client-side route 404s.

**The window gets its own browser profile** (`%TEMP%\corefitness-admin-profile`).
`--app` on its own hands the URL to whatever browser window is already open and
returns immediately, which would leave the server running forever with nothing
to stop it. A separate `--user-data-dir` forces a browser process whose lifetime
*is* the window's: close the window and the server exits and frees the port —
verified.

It also means the dashboard's Supabase session lives in its own storage rather
than in anyone's personal browser, which is the right arrangement for a shared
desk machine.

**Double-clicking twice is harmless.** The second launch finds the port taken,
focuses the existing window and exits — one server, one window.

**Windows paths in `serve.mjs` use forward slashes on purpose.** `'C:\Program
Files'` in a JavaScript string silently drops the backslash (`\P` is not an
escape), producing `C:Program Files`. That is how this shipped the first time:
`existsSync` reported the browser missing when it was right there, and the icon
started a server that opened no window.

## If the icon appears to do nothing

1. **Not built yet** — you should get a dialog saying so. Run `npm run build`.
2. **Port 5174 busy** — if `npm run dev` is already running, the launcher will
   just point the window at it. That is fine, and it is the dev server you are
   looking at.
3. **Node moved** — `launch.vbs` looks in `C:\Program Files\nodejs` and then on
   `PATH`.
4. Check it by hand with the console visible:
   ```powershell
   cd g-fitness-admin\desktop; node serve.mjs
   ```

## What this is not

It is not a packaged installer. The shortcut points at this folder, so moving or
deleting the repo breaks it — re-run `install-shortcut.ps1` after moving. Making
it relocatable means Electron or Tauri, which is a much larger dependency than
this problem deserves.
