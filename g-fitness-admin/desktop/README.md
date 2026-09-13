# Core Fitness Admin — desktop launcher

Turns the admin dashboard into something you open from a desktop icon: one
window, no terminal, no address bar, no tabs.

The admin app is deliberately **not deployed** — it is a front-desk tool for one
laptop, and keeping it off the public internet is the point (see
[DEPLOYMENT](../../docs/DEPLOYMENT.md)). This gives it the convenience of an
installed app without giving it a public URL.

## Install (once per machine)

Two ways, and they do the same thing. Pick whichever the person at the desk
finds less surprising.

**A real `.exe`** — one program file you double-click, and can copy anywhere:

```powershell
cd g-fitness-admin; npm install; npm run build; .\desktop\build-exe.ps1
```

That compiles `CoreFitnessAdmin.exe` here and drops a copy on the Desktop as
**Core Fitness Admin.exe**. Add `-NoDesktop` to build without the copy.

**A shortcut** — no binary to build, but it is a `.lnk` pointing at
`wscript.exe`, which some people find odd in Properties:

```powershell
cd g-fitness-admin; npm install; npm run build; .\desktop\install-shortcut.ps1
```

That puts **Core Fitness Admin** on the Desktop and in the Start menu.
Re-running either script is safe.

After changing admin code, run `npm run build` again — the launcher serves
`dist/`, not the dev server, so an unbuilt change will not appear.

## What the pieces do

| File | Role |
|---|---|
| `serve.mjs` | Serves `dist/` on `localhost:5174` and opens the app window. All the behaviour is here. |
| `CoreFitnessAdmin.cs` | The `.exe`'s source: find Node, find `serve.mjs`, start it with no console. |
| `build-exe.ps1` | Compiles that with the `csc.exe` inside Windows. Also copies the result to the Desktop. |
| `make-portable.ps1` | Packs the `.exe`, `serve.mjs` and `dist/` into one folder that runs on a machine with no repo. |
| `launch.vbs` | The shortcut's equivalent of the `.exe` — starts `serve.mjs` with the console hidden. |
| `make-icon.ps1` | Builds a 6-size `.ico` from `public/core-fitness-logo.png`. |
| `install-shortcut.ps1` | Creates the two shortcuts. Calls `make-icon.ps1` if the icon is missing. |

No new npm packages, no Electron, no Rust toolchain — just Node, which is
already required to build the app, a browser, which is already installed, and
for the `.exe` the C# compiler that ships inside Windows itself
(`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`).

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
3. **Node moved** — both launchers look in `C:\Program Files\nodejs` first and
   on `PATH` afterwards, because a program started from Explorer does not
   always inherit the `PATH` a terminal has. The `.exe` says so in a dialog if
   it finds nothing.
4. Check it by hand with the console visible:
   ```powershell
   cd g-fitness-admin\desktop; node serve.mjs
   ```

## Taking it to another computer

```powershell
cd g-fitness-admin; .\desktop\make-portable.ps1
```

Produces **Core Fitness Admin\** on the Desktop — the `.exe`, `desktop\serve.mjs`
and `dist\`, about 5.3 MB. Copy the whole folder anywhere; it needs **Node.js
and internet** on that machine and nothing else. Verified by hiding this repo's
`serve.mjs` and running the copy: it started its own, and served the dashboard.

The layout is load-bearing. The `.exe` looks for `serve.mjs` beside itself and
then in a `desktop\` folder under itself *before* the absolute path compiled
into it, so the copy uses its own files rather than reaching back into the repo
— which is exactly what would silently happen on the build machine, hiding the
fact that the folder was incomplete.

## What this is not

It is not a packaged installer, and the `.exe` is a launcher, not the app — 84
KB that starts `serve.mjs`, which serves `dist/`. The three travel together or
not at all. A lone `.exe` on a strange machine puts up a dialog naming the two
places it looked for `serve.mjs`, and exits.

The shortcut and the `.exe` both point back at this folder — the `.exe` has the
path compiled into it — so **moving or deleting the repo breaks them**; re-run
`build-exe.ps1` (or `install-shortcut.ps1`) after a move. Making a single file
that needs nothing at all means bundling Node and the dashboard into it, i.e.
Electron or Tauri, which is a much larger dependency than this problem deserves.

The `.exe` is unsigned. That costs nothing here because it is compiled on the
machine that runs it: SmartScreen warns about files carrying a mark of the web,
and a locally built one has none. Emailing it to another machine would trip
that warning — build it there instead, it takes a second.
