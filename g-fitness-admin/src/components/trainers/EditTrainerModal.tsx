import { useState } from 'react';
import { Lock, Mail } from 'lucide-react';
import StepModal, { StepField } from '../ui/StepModal';
import { STEP_INPUT, STEP_INPUT_STYLE } from '../ui/stepStyles';
import { updateTrainerProfile } from '../../lib/api/trainers';
import { updateProfile } from '../../lib/api/profiles';
import { isPhoneTaken } from '../../lib/api/members';
import { showToast } from '../../utils/toast';
import { CoachSection, DaysSection, WhoSection } from './TrainerFields';
import { TRAINER_STEPS, certsOf, draftErrors, draftFrom, yearsOf, type TrainerDraft } from './trainerDraft';

export interface EditableTrainer {
  id: string; firstName: string; lastName: string; email: string; phone: string | null;
  specialization: string; bio: string | null; achievements: string | null; yearsExperience: number | null;
  focusAreas: string[]; certifications: string[]; availabilityDays: string[];
}

/**
 * Edit a coach (2026-10-20, the owner's correction): the same four sections as
 * Add trainer, drawn from the same TrainerFields, as tabs you can open in any
 * order — so years coaching is the same control in both, and nothing Add asks
 * is missing here. The login (email) is shown, not edited: changing it means
 * changing the auth account, which is not done from a form.
 */
export default function EditTrainerModal({ trainer, onClose, onSaved }: {
  trainer: EditableTrainer; onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const [tab, setTab] = useState(0);
  const [d, setD] = useState<TrainerDraft>(() => draftFrom(trainer));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TrainerDraft>(k: K, v: TrainerDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const name = `${trainer.firstName} ${trainer.lastName}`.trim();

  const save = async () => {
    const e = { ...draftErrors(d, 0), ...draftErrors(d, 1) };
    const phone = d.phone.trim();
    if (!e.phone && phone && phone !== (trainer.phone ?? '') && await isPhoneTaken(phone)) e.phone = 'Another account already uses this number.';
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setTab(e.firstName || e.lastName || e.phone || e.years ? 0 : 1);
      return;
    }
    setBusy(true);
    try {
      await updateProfile(trainer.id, { first_name: d.firstName.trim(), last_name: d.lastName.trim(), phone: phone || null });
      const certifications = certsOf(d);
      await updateTrainerProfile(trainer.id, {
        specialization: d.specialization.trim(),
        bio: d.bio.trim() || null,
        availability: d.days.join(', ') || null,
        years_experience: yearsOf(d),
        certifications: certifications.length ? certifications : null,
        focus_areas: d.focus.length ? d.focus : null,
        achievements: d.achievements.trim() || null,
      });
      showToast(`${d.firstName.trim()} ${d.lastName.trim()} saved`, 'success');
      await onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save the changes', 'error');
    } finally {
      setBusy(false);
    }
  };

  const flagged = [
    ...(errors.firstName || errors.lastName || errors.phone || errors.years ? [0] : []),
    ...(errors.specialization ? [1] : []),
  ];

  return (
    <StepModal title={`Edit ${name}`} subtitle="The same details you gave when adding them — open any section."
      steps={TRAINER_STEPS} step={tab} onStep={setTab} canNext onNext={() => void save()} onBack={() => undefined}
      onClose={onClose} finishLabel="Save changes" busy={busy} tabs flagged={flagged}>
      {tab === 0 && <WhoSection d={d} set={set} errors={errors} />}
      {tab === 1 && <CoachSection d={d} set={set} errors={errors} />}
      {tab === 2 && <DaysSection d={d} set={set} />}
      {tab === 3 && (<>
        <StepField label="Login email" hint="They sign in with this, choosing Trainer on the sign-in screen.">
          <div className="relative">
            <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-secondary)' }} />
            <input value={trainer.email} disabled aria-label="Login email" className={`${STEP_INPUT} pl-9 cursor-not-allowed`}
              style={{ ...STEP_INPUT_STYLE, color: 'var(--color-text-secondary)' }} />
          </div>
        </StepField>
        <p className="text-[11.5px] rounded-lg px-3 py-2 flex gap-2" style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}>
          <Lock size={13} className="flex-none mt-0.5" />
          The email is their login, so it is not changed here. A forgotten password: they tap “Forgot password” on the sign-in screen and get a reset link at this address.
        </p>
      </>)}
    </StepModal>
  );
}
