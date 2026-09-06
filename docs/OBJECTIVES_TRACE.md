# Objectives → Implementation → How to Demonstrate

Every specific objective from the manuscript, mapped to the code that serves it
and to the thing you click to show it working. Objectives are quoted from
`docs/manuscript_content.txt` rather than paraphrased — a paraphrase drifts, and
the panel is reading the original.

**Read the architecture discrepancy at the bottom first if you are preparing a
defence.** It is the one thing on this page that a panel will raise and that no
amount of working software answers on its own.

---

## Objective 1 — A cross-platform fitness ecosystem

### For gym management (web-based administration)

| Objective (quoted) | Where it lives | Demonstrate it by |
|---|---|---|
| "Centralized Operational Core: … managing membership records, QR code-based attendance monitoring, and payment reporting automation, replacing paper-based attendance and manual record-keeping." | `Members.tsx`, `Attendance.tsx`, `Payments.tsx`; tables `profiles`, `member_profiles`, `attendance`, `payments` | Scan a member's QR at Attendance; the row appears in Attendance → History and in the member's own history immediately. |
| "Rule-Based Monitoring and Analytics Dashboard: … applies predefined system rules to monitor attendance records, membership renewals, inactive, and operational insights" | `Dashboard.tsx`, `Retention.tsx`, `dashboardService.ts`; expiry sweeps in 0053 | Open Retention: at-risk members are derived from real attendance gaps, not a fixture. |
| "Business Intelligence Dashboard: … monitoring membership growth, financial performance, attendance records, and facility utilization." | `Dashboard.tsx` (bento), `Revenue.tsx`, `Analytics.tsx` | Dashboard fits without scrolling; the hourly heatmap is real check-in data. |
| "Staff and Schedule Management" | `Settings.tsx` (staff accounts, 0011/0012), `Schedule.tsx`, `class_templates` | Create a staff account; sign in as them and confirm pricing, trainers and the audit log are unreachable. |
| "Role-Based Access Control (RBAC): … Administrator, Trainer, and Member roles with distinct permissions" | `profiles.role`, `get_my_role()`, RLS on every table; `ProtectedRoute` | The negative test is the demonstration — see `docs/TEST_MATRIX.md`. RLS is the boundary; the route guard is convenience. |
| "Membership Registration and Approval Workflow: … require administrator approval and payment verification prior to account activation." | `Register.tsx` → `pending_registrations`; `Members.tsx` approval → `startFreeMembership()` | Register, confirm the pending account can sign in but unlocks nothing, then approve. |

### For members (mobile application)

| Objective (quoted) | Where it lives | Demonstrate it by |
|---|---|---|
| "NLP-Based Administrative Assistant (Chatbot)" | `ChatbotPage.tsx`, `fitnessAssistant.ts`, `planBuilder.ts` (0047), threads in 0046 | **State honestly that the rules answer ~98% and the model escalation is unshipped.** See the caveat below. |
| "Digital Identification and Access: … unique QR code for gym entry" | `qrCode.ts`, `QRScanner`, `member_profiles.qr_code` | Show the member's QR, scan it in admin. Decoding is jsQR over the full frame — `BarcodeDetector` does not exist in Chrome on Windows. |
| "Personal Progress Monitoring: … attendance history, membership status, body measurements (weight, BMI, arms, waist, chest, and legs), attendance consistency, membership progress, goal achievement records, achievement badges, and visual analytics" | `pages/progress/`, `progressService.ts`, `member_progression()`, 0020, 0028 | Progress tab. Every number has a source; a missing one renders nothing. |
| "Event and Announcement Management: … publish gym announcements, schedules, events, and important updates accessible to members" | admin Communications (Announcements + Events tabs), member Updates ↔ Events | Post an announcement with a picture (0065); it appears on the member's Updates. |
| "Account Management: … manage their personal information, membership details, attendance records" | `EditProfile.tsx`, `Profile.tsx`, `Membership.tsx` | Change a photo and confirm it saves — `updateMyProfile` now fails loudly on a zero-row write. |
| "Trainer Rating and Evaluation System: … submit trainer ratings, monthly evaluations, and feedback comments. The system generates trainer performance insights to support service quality improvement" | `trainer_ratings` (0042), monthly `period` (0066), anonymised reads + admin insights (0072) | Rate a trainer; confirm the trainer sees the score and comment **and no name**, and the admin sees both. |
| "Goal Achievement and Gamification System: … set fitness goals, monitor milestones, receive achievement badges, and track goal completion" | 0028 achievements, 0051 CORE Points, 0052 challenges, 0055 goal presets | Complete a goal; the badge is awarded by SQL, not by the client. |

### For trainers

| Objective (quoted) | Where it lives | Demonstrate it by |
|---|---|---|
| "Trainer Dashboard and Class Management: … viewing assigned classes, monitoring schedules, managing training sessions, and reviewing member participation records" | `TrainerHome.tsx`, `TrainerSchedule.tsx`, `TrainerMembers.tsx` | Sign in as a trainer; the roster is RLS-filtered, not client-filtered. |
| "Trainer Feedback and Recommendations: … provide workout recommendations, performance evaluations, improvement suggestions, and assigned workout plans while monitoring member progress" | `trainer_feedback` (0072), `workout_plans`, `trainer_may_see()` (0032/0048) | **Partly done.** The table, policies and API exist; the compose form is not built. Say so rather than showing the API. |
| "Booking and Availability Management: … manage availability schedules, review bookings, and accept or decline training session requests" | `TrainerAvailability.tsx`; accept/decline in `TrainerBookings.tsx` (0071) | Accept a request as the trainer; the admin's queue shows "Accepted by their trainer" and can reverse it. |

**Worth noticing:** three of the panel's requests — trainer accept/decline, monthly
evaluations, trainer feedback and recommendations — are not new scope. They are
objectives the manuscript already committed to and the build had not reached.
That is a good answer to "why are you changing things this late": you are not,
you are finishing what was specified.

---

## Objective 3 — ISO 25010

The manuscript commits to eight characteristics. What can honestly be claimed today:

| Characteristic | Evidence | Honest status |
|---|---|---|
| Functional suitability | `docs/TEST_MATRIX.md`, per role and per plan | Being built out |
| Reliability | Zero-row write guards; idempotent sweeps; dedupe indexes | Good, and improving |
| Performance efficiency | No measurements taken | **Unmeasured — do not claim it** |
| Usability | SUS instrument described in the manuscript | Not yet administered |
| Security | RLS on every table, probed as a non-superuser | Strongest area |
| Compatibility | Admin on desktop Chrome; member as PWA → Android TWA | iOS untested |
| Maintainability | One migration per change, each documenting its own reasoning | Good |
| Portability | Free-tier hosting; env vars, no hardcoded hosts | Good |

Two of these are honestly unmeasured. Saying so is a better defence than a
number nobody can reproduce.

---

## The architecture discrepancy — read this before the defence

Objective 2 of the manuscript specifies:

> "React.js … React Native … Node.js & Express … MySQL 8.0 … Firebase"

**The system as built uses none of the middle three.** It is:

| Manuscript says | Built as | Why |
|---|---|---|
| React.js (admin) | React 19 + Vite | Matches. |
| React Native (member) | React PWA → Android **TWA** | Ships to a real phone with no app-store account and no build server; `sw.js` updates installed phones without a rebuild. |
| Node.js & Express | **No application server.** PostgREST + Postgres RLS + four Edge Functions | The security boundary is in the database, so there is no server tier to bypass. |
| MySQL 8.0 | **PostgreSQL** (Supabase) | RLS is a Postgres feature. MySQL has no equivalent, so the RBAC objective could not have been met the way it is met here. |
| Firebase | Supabase Auth + Web Push | One platform for auth and database; free tier. |

This is a real and material difference, and a panel reading the manuscript will
find it in about a minute. Two ways to handle it, in order of preference:

1. **Amend Objective 2 in the manuscript** to describe what was built, with the
   justification above. The objectives are meant to describe the study; a study
   that describes a system nobody built is the actual problem.
2. If it cannot be amended in time, **raise it before they do**, framed as a
   design decision with a reason: RBAC in RLS is stronger than RBAC in an
   Express middleware, because the middleware can be bypassed and the database
   cannot.

Do not present the system as if it uses MySQL and Express. It does not, and the
migrations are in the repository for anyone to read.

## The other honesty item — "NLP-based"

`planBuilder.ts` and the assistant are **deterministic and rule-based**. No model
call is made; `fitness-assistant` is written but undeployed and its secrets are
unset. The UI says so and must keep saying so.

The defensible framing: the rule engine answers the overwhelming majority of
real queries, `planRender.ts` is the seam where a model would attach, and the
system is honest with the user about which it is. An "AI" label over an if-chain
is the kind of claim a technical panel checks.

---

## Keeping this file true

It is a map, and a map goes stale. When a feature moves, moves out, or gets
finished, change the row. A trace document that lists something the build no
longer does is worse than no trace document, because it will be read aloud.
