# A lively member app — design (2026-10-27)

## Why

The member app works, is aligned and has a full back end, but it reads as text.
The owner wants members to feel **proud, pulled back, competitive and
playful** — beginners who drift away, regulars who want more to chase, young
members used to game-like apps, everyone. It must impress the capstone panel
*and* hold up in daily use, because after the defence it is sold to other gyms.

## What it is, and is not

- **Add design on top of the current UI. Not a redesign.** Layout, navigation,
  copy rules and colour roles (violet = where you are / what you have, amber =
  what you can do next) stay.
- **Style: a polished fitness app** (Strava / Apple Fitness), not a cartoon
  game. **No mascot.**
- **Bring existing mechanics to life** — points, earned levels
  (`member_progression()`), badges (`achievement_unlocks`), streaks, weekly
  quests, challenges, seasons, squads, PR wall, leaderboards. **The one new
  mechanic is friends + cheers (wave 3).**
- **Every number is real** (CLAUDE.md, data honesty): a celebration shows the
  points the ledger actually credited, the streak the database computed, the
  level `member_progression()` returned. Nothing is invented to make a moment
  bigger; a moment with nothing real to show is smaller, never padded.
- Gym-themed: everything uses `var(--color-primary*)`, never a fixed violet.

## Waves (each: mock-ups → owner approves → build exactly → deploy)

### Wave 1 — the big moments
Full-screen celebrations, with **vibration and sound**:
1. **Checking in** — when the desk/kiosk scans the member (the check-in sheet
   already learns this): arrival, streak +1, points from the visit.
2. **Finishing a workout** — the existing finish screen made livelier
   (count-ups, record burst, points, level progress).
3. **Badge unlocked** — the existing `AchievementUnlockOverlay`, richer
   (tier medal, shine, sound).
4. **Level up** — new moment when the earned level rises.
5. **Target reached / challenge won** — new moments when `settle_my_goals()`
   or `settle_challenges()` report one.
6. **The first open of the day** — a short arrival on Today: streak, level
   progress, what is waiting today.

### Wave 2 — the everyday screens
Today, Train, You (a trophy room: level emblem, badge shelf, records, stats)
and the rewards / challenges / season pages made livelier.

### Wave 3 — friends, wins and cheers
- **A real friend list**; both people accept. Add by **name search** (own gym
  only), **scanning a friend code**, or **tapping someone on a squad /
  leaderboard**. Squad mates and referral pairs are **suggested**, never
  automatic. Members are **findable by name unless they turn it off**.
- **Wins** (my call): personal records, streak milestones, badges, level-ups,
  targets reached, challenges won — not every workout. Seen by **friends and
  squad mates by default; the member can opt out**.
- **Cheers** on a win: the person gets a **notification**; their **coach sees
  cheers** on the trainee sheet. No cheer count on the win.
- **Its own Friends page** (in More); a short strip of friends' wins on Today
  with See all to that page (my call).
- **Admin: counts only** in the member drawer (friends, cheers received) —
  never who, never what.

## Constraints

- **Sound: clean and modern** (soft chimes and pops), **on by default**, a
  member setting turns it off. **Vibration** on the same moments.
- **Rich motion is accepted** even if cheap phones stutter — but a phone set to
  **reduce motion always gets still versions**.
- **Gym owner: three switches** in the admin app — *celebrations* (big moments
  become small), *sounds* (off for the gym), *friends & cheers* (off for the
  gym). Per gym, read by the member app, enforced in SQL where it gates data.
- **Artwork**: free licensed assets (licence recorded), AI-generated art the
  owner approves, code-drawn where needed.
- Celebrations never block: dismissed by a tap, never a timer; never replayed
  forever (the `seen`-on-show rule of `AchievementWatcher` applies to every
  new moment); never more than a few in a row.
- Offline: a moment from work done offline is celebrated on the phone with
  what the phone knows, and says the points come when it is back online.
- Align all three apps: a member-facing rule change is visible to admin and
  trainer in the same work (CLAUDE.md).

## Left to the builder
Exact timings and easing, the sound synthesis or files, which free animation
assets, how a moment learns the points credited (ledger read after the write),
and the migration shape for the switches and wave 3 — each checked against
the approved mock-ups and DATA_ACCESS.md.
