# Motion videos for the website mock-up's media

Ten 8 second loops, one HyperFrames project per folder, in the style of the owner's reference
recording (motion inventory: the session notes, `role-videos-motion-inventory.md`). Each opens on a
real Core Fitness Lab capture, dims it, and pops out rebuilt pieces that use only that capture's own
words and numbers (demo records) or the app's own strings; then everything flies back so the loop is seamless.

| Folder | Plays as (website-mockup-v2/public/mockup-art) | Used by |
| --- | --- | --- |
| owner, desk, coach, member | roles-*.mp4/.webm | role pills; also overview, payments, coach, member demos |
| checkin, workout, progress, bookings, assistant, renewal | demo-*.mp4/.webm | MockupDemoMedia (day, features, month) |

- Run `npx --yes hyperframes@0.9.61` (the plugin's 0.9.60 is no longer on npm).
- `make-features.py` writes the six feature videos; `assets/` holds the shared `pieces.css`, `kit.js`
  (the motion grammar) and `qr.svg` (decorative, deliberately not a scannable code); `sync.sh` copies them in.
- `sh check-all.sh` (layout, overflow, contrast), then `sh render-all.sh [names]` writes `renders/`;
  copy `roles-<name>.*` into mockup-art (the six feature ones as `demo-<name>.*`).
- The desktop frame on the page crops the video: keep every piece inside x < 860, y < 560 of 1440 x 900.
