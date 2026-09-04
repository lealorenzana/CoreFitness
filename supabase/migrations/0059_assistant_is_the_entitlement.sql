-- 0059 — the assistant itself is the entitlement, not just the model behind it.
--
-- 0049 split the assistant in two: everyone could ask the rule-based assistant
-- about the gym, their membership and their bookings, and only *model* answers
-- to general fitness questions were gated. The `ai_model` row said so in as
-- many words:
--
--     'General fitness and training questions answered by an AI model. Everyone
--      can still ask the assistant about the gym, your membership and your
--      bookings.'
--
-- On a phone that is not what it looked like. A Free Plan member read
-- "Smarter AI assistant — not on this plan" on their membership card and then
-- had the chathead floating over every screen in the app. Two readings, both
-- bad: the lock is broken, or the lock is real and the button is bait.
--
-- The gym's decision is that the assistant is a paid feature. So the app now
-- hides the chathead for plans without `ai_model` (the route still locks and
-- explains — see ChatbotPage), and this file makes the database say the same
-- thing. Leaving the old description in place would be worse than the original
-- inconsistency: `FeatureLock` reads its wording straight out of this row, so
-- the lock card itself would have promised access it was in the act of denying.
--
-- Nothing about *who* gets it changes here. The defaults are untouched and the
-- matrix is the admin's to edit on the Membership Plans screen — including
-- handing the assistant back to a free tier, which is one tick.

update features
   set label = 'AI assistant',
       description =
         'Ask about your membership, bookings, classes and training, and get '
         'general fitness questions answered by an AI model.'
 where key = 'ai_model';

-- ============================================================================
-- IF YOU EVER RE-PASTE 0049, RUN THIS AGAIN
-- ============================================================================
--
-- 0049's seed ends in `on conflict (key) do update set label = excluded.label,
-- description = excluded.description, ...`, which is what makes it safely
-- re-runnable — and also what would quietly restore the old wording over this.
-- Same shape as 0057's note about `sync_plan_features()`: these files are each
-- re-runnable on their own, but 0049 → 0059 is the order that ends up correct.
--
-- Verify:
--   select key, label, description from features where key = 'ai_model';
