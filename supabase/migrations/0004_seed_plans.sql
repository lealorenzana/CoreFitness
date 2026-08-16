-- Core Fitness — seed data
-- Minimal starter catalog so registration/approval has a real plan to attach to.
-- Full tier content (what Free/Freemium/Premium actually include) is deferred
-- feature work — this just gets the foundation demonstrable end-to-end.

insert into membership_plans (name, tier, price, duration_days, description, is_active) values
  ('Free Access', 'free', 0, 3650, 'Gym floor access\nLocker room access', true),
  ('Freemium Trial', 'freemium', 0, 90, '3-month trial\nGym floor access\n1 group class per week', true),
  ('Premium', 'premium', 1500, 30, 'Full gym access\nAll group classes\nTrainer booking priority', true);
