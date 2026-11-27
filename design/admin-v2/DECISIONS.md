# Design V2: the gym owner's admin app (`g-fitness-admin/`)

Rules come from `design/lessons/LESSONS.md`; the kit stays `components/ui/rd.tsx`; fit pages hold at 1280 and 1600.

## Owner's choices (2026-11-22)
1. **Dashboard = mock-up B, "the day line"** (`dashboard-b.html`): the gym's day from opening to closing
   (check-ins per hour, classes on their times, a "now" line), the hero number is today's check-ins,
   Needs you is a right rail, this month's four figures sit in a tabbed box with Revenue by month and
   Busy hours, Members to watch beside it.
2. **Flat, no glow** in the admin app: neutral ground, hairline borders, no drifting gym colours behind
   glass, no `RdCard glow`. The gym colour appears only on what is selected and the one main button.
   This overrides the 2026-11-07 glass rule for admin only.
3. **Status = a dot and a word**, never a coloured pill (same as the platform redesign).
4. **Order**: the shell (sidebar, top bar, cards) with the Dashboard, then Attendance, Members, Payments,
   Personal training, Notifications, Classes, Reports, Engagement, Training, Gym chat and Help, then
   Settings, Your app, Your plan and the rest; Kiosk and Lobby TV last. Ask before any big layout change.

## Before screenshots
`before/` holds every page at 1600x900 and 1280x800, dark and light (fixture data, Core Fitness Lab).
5. **Shell = mock-up B, "rail and tabs"** (owner, 2026-11-22, after first picking A; A was built, not shipped). Was: **mock-up A, "sections, one open"** (`shell-a.html`, 2026-11-22): the menu keeps its groups; only the
   group holding the page you are on is open, so the sidebar never overflows. Gym name and town at the top
   (no longer repeated in the header). The header says where you are, then search and alerts.
6. **Account menu**: your name at the foot of the sidebar opens Light or dark, Settings, Log out on this
   device and Log out on all devices; the separate Logout row and the header's sun/moon go away.
7. **Attendance = mock-up A, "desk console"** (`attendance-a.html`, 2026-11-22): check-in and the log on the left; the day's figures and At the door (kiosk, lobby TV, coaches) on a right rail. Walk-ins and History follow its style.
8. **Notifications = the mail-app layout** (`inbox.html`, 2026-11-22): folders (Needs attention, Unread, All, Archived, then kinds), the list, the open message.

## The whole system (owner, 2026-11-27)
9. **One shared language across all four apps** (member/trainer, gym owner, super admin, website): the same
   tokens and rules (type scale, spacing, radius, buttons, status dot and word, one action colour, empty and
   loading states), while each app keeps its own layout (phone tabs, desk rail, platform console, marketing page).
10. **Flat everywhere**: Design V2's material spreads to every app. The member app's drifting glass (2026-11-07)
    and the platform's aurora go; the gym colour shows only on what is selected and on data marks.
11. **Order**: finish the gym owner's Design V2 first (Attendance next, see NEXT.md), then carry its rules to the
    platform, member/trainer and the website.
12. **Mock-ups**: the owner says whether a step gets mock-ups before it is built. Build nothing until the owner says go.
13. **Attendance = mock-up D** (`attendance-d.html`, 2026-11-27, owner's idea): the search box and the log are one
    list of every member. Nothing typed: In today first (newest first), then Not in yet A to Z, each with Check in.
    Typing narrows it; members you can check in rise to the top. A member the rules refuse shows why, not hidden.
    Enter checks in only when exactly one member matches. Filters: Everyone · In today · Not in yet, plus How.
    One orange button (Scan QR); slim terms line; figures in one strip; the rail is only At the door.
