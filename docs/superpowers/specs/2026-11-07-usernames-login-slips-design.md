# Usernames, login slips, first-sign-in set-up, sign-up photo (2026-11-07)

The owner's questions and answers (AskUserQuestion, 2026-11-07):

| Question | Answer |
|---|---|
| Usernames? | **Optional.** Sign in with email **or** username. A desk-made account may have a username and no email. |
| Handing a desk-made login over | **Email it when there is an email, and always show a printable login slip.** |
| First sign-in of a desk-made account | New password (already), then **choose a username**, then **an optional photo**. |
| Photo at self sign-up | **Optional step**, shown live on the member card. |

Already true, unchanged: a member who signs themselves up ("Anyone can find you" / "Only with link or
code") chose their own password and is never asked to change it.

## What existed

* **Invitations (0202):** `invite-account` makes the login with a one-time password, emails it, returns it
  to the screen only when the email failed; first sign-in (`FinishInvite`) forces a new password
  (`must_change_password`) and the role's form, then `complete_invitation()`.
* **Add member (walk-in, `create-member`):** the desk *typed* a password; no forced change. Wrong by the
  owner's model — fixed here.
* Logins were email-only; `profiles.email` is `not null unique`.

## Decisions

1. **`profiles.username`** — optional, unique across Core Fitness (accounts move between gyms), 3–20 of
   `a-z 0-9 . _`, starts and ends with a letter or digit, stored lowercase. Set by `set_my_username()`,
   or by the desk when it makes the account. A trigger checks the form; a unique index the uniqueness.
2. **A desk-made account with no email** gets a stand-in address `<username>@no-email.invalid` — the
   reserved `.invalid` TLD can never receive mail — so Auth, `gym_invitations` and `accept_invitation()`
   work unchanged. `is_stand_in_email()` (SQL) / `realEmail()` (client) hide it: screens say "No email".
   Nothing is ever sent to it (`send-email` refuses it).
3. **Signing in with a username is done on the server** (`sign-in-username` Edge Function): it finds the
   address with the service role, signs in, and returns the session. The client never learns anyone's
   email from a username, and a wrong username and a wrong password get the same answer. Server-side
   sign-ins bypass Auth's per-IP limit, so the function keeps its own: **5 failures per username per
   15 minutes**, counted in `login_failures` (no policy for any role).
4. **Both desk paths hand out a generated one-time password** and set `must_change_password`; the screen
   **always** shows a printable **login slip** (gym, name, sign in with, one-time password, the app link
   and its QR). The email still goes when there is a real address.
5. **Reset login** (desk, on a member; owner, on a coach or the desk): a new one-time password and a
   slip — only for an account with **no real email** or that **never finished its first sign-in**. An
   account with an email uses "Forgot password"; the desk can never quietly take over a working one.
6. **First-sign-in set-up** (`SetUpLogin`, member and admin apps): new password → username (required
   when there is no email — the desk's one is filled in, keep or change; skippable with an email) →
   optional photo. Shown for an invitation (before its form) and for a walk-in account.
7. **Sign-up photo**: an optional step on Register with the cropper; the card shows it at once. With no
   session yet (email to confirm, or the desk to approve) the cropped photo waits on that phone
   (`lib/pendingPhoto.ts`, keyed by the email) and is uploaded at the first sign-in, then removed.
8. **Login screens** say "Email or username"; a username's "Forgot password" says to ask the front desk.
9. **Settings → Username** in both apps (add, change, remove — removing is refused while there is no
   real email, or they could not sign in).
10. **Privacy Policy** says a username may be kept and that the desk may make your login and hand you a
    slip; `PRIVACY_VERSION` moves.

## Migration 0236

`profiles.username` + check + unique index; `login_failures`; `is_stand_in_email()`;
`username_available()`, `set_my_username()` (authenticated); `login_email_for_username()` (service role
only — revoked from every client role); `migration_0236_applied()` for the probe. Before it is pasted,
every screen hides the username parts and the login screens sign in by email as today.
