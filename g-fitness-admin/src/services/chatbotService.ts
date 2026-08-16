import { getGymSettings, type GymSettingsRow } from '../lib/api/settings';
import { listPlans } from '../lib/api/membershipPlans';
import { listTrainers } from '../lib/api/trainers';
import { listClassTemplates, type ClassTemplateRow } from '../lib/api/classTemplates';
import type { MembershipPlanRow } from '../types/db';

/**
 * Everything the admin assistant is allowed to speak about.
 *
 * The assistant used to answer entirely from a hardcoded array: three gyms that
 * do not exist ("G-Fitness (Poblacion), Fitness Regency, Ferrer Fitness"), four
 * invented coaches, three invented phone numbers, plans at ₱800/₱1,500/₱2,500
 * that appear nowhere in `membership_plans`, and opening hours of 5:00 AM –
 * 10:00 PM that directly contradicted the `gym_settings` the Settings page
 * writes and the Schedule page enforces. An admin could ask the assistant the
 * gym's hours and get a different answer than the gym's own record.
 *
 * Every field below now comes from the database. A section with no data says so
 * and names the page that fills it — it never invents a plausible answer.
 */
export interface TrainerBrief {
  name: string;
  specialization: string | null;
}

export interface ChatbotContext {
  gym: GymSettingsRow | null;
  /** Active plans only — a retired plan is not something to quote a price from. */
  plans: MembershipPlanRow[];
  trainers: TrainerBrief[];
  /** Active recurring templates — the weekly plan members actually book against. */
  templates: ClassTemplateRow[];
}

export const EMPTY_CONTEXT: ChatbotContext = { gym: null, plans: [], trainers: [], templates: [] };

/**
 * Loads the assistant's world in one pass.
 *
 * Each source degrades on its own: a failed trainer read must not blank out the
 * opening hours. The per-section "not set up yet" wording then does double duty,
 * covering both "no rows" and "could not read" — neither is a licence to guess.
 */
export async function loadChatbotContext(): Promise<ChatbotContext> {
  const [gym, plans, trainers, templates] = await Promise.all([
    getGymSettings().catch(() => null),
    listPlans().catch(() => [] as MembershipPlanRow[]),
    listTrainers().catch(() => []),
    listClassTemplates().catch(() => [] as ClassTemplateRow[]),
  ]);

  return {
    gym,
    plans: plans.filter((p) => p.is_active),
    trainers: trainers.map((t) => ({
      name: `${t.profile.first_name} ${t.profile.last_name}`.trim(),
      specialization: t.trainer.specialization,
    })),
    templates: templates.filter((t) => t.active),
  };
}
