# Refer a friend — design

**Date:** 2026-09-27 · **Status:** approved in conversation · **Migration:** 0125 · **Roadmap:** piece 4 of 5

## Decisions made in conversation

| Question | Decision |
|---|---|
| Who earns | **Both**: the referrer (`referral` rule, 100) and the friend (`referral_welcome`, 50). Owner re-prices or switches either off. |
| Limit | **5 rewarded referrals per referrer per Manila month.** Past that, referrals still record and show, and earn nothing that month. |
| The paid moment | **The friend's first payment the desk records with an amount above ₱0**, status completed. A free trial or free plan alone earns nothing. |

## How it works

- Each member has a **referral code per gym** (6 letters, `my_referral_code()` makes it on first ask). Their share link is `/join/<slug>?ref=CODE`.
- The friend is recorded as **referred** when they arrive in the gym through it:
  - a **new account** carries the code in sign-up metadata (`referral_code`), and a trigger on `gym_roles` records it when the member's row lands in that gym;
  - an **existing account** joining another gym calls `claim_referral(gym, code)` right after `request_to_join`.
- A friend can be referred **once per gym**, never by themselves, and only while they have **no completed payment above ₱0 there yet** — so an existing paying member cannot be "referred" after the fact.
- A trigger on `payments` (insert or update to completed, amount > 0) pays the pending referral **once**: the referrer's points (under the monthly cap) and the friend's welcome points, both through the ledger's idempotency key, both behind `plan_allows(…, 'points_earn')`. Both are notified.
- `referrals` has **no write policy**: only the functions and triggers write it.

## Screens

Member: **Invite a friend** (`/member/refer`) — code, share link, and each referral's status (joined / paid, points earned). The join page keeps `?ref=` through sign-up and claims it. Admin: **Rewards → Referrals** — who brought whom, status, and this month's counts.

## Testing

`scripts/sql/referrals.mjs`, fixtures, `verify0125.sql`.
