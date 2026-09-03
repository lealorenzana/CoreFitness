import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Save, Clock, ChevronRight } from 'lucide-react';
import Avatar from '../../components/ui/Avatar';
import { Field, TextInput, TextArea } from '../../components/ui/Field';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import CredentialsSection from '../../components/ui/CredentialsSection';
import { panelStyle } from '../../components/ui/Card';
import { getMyProfile, updateMyProfile } from '../../lib/api/profiles';
import { getTrainer, updateTrainerProfile } from '../../lib/api/trainers';
import { uploadMyAvatar, removeMyAvatar } from '../../lib/api/avatars';
import { getCurrentTrainerId } from '../../services/trainerService';

/**
 * Trainer self-service profile editing.
 *
 * Trainers previously had no way to change anything about themselves — their
 * profile screen was read-only with a logout button, so a new trainer was stuck
 * with whatever the admin typed when creating the account.
 *
 * Two tables, two policies: name/phone/photo live on `profiles`
 * (profiles_update_self), specialization/bio/availability on `trainer_profiles`
 * (trainer_profiles_update_self, added in 0010). Email is not editable here —
 * it is the login identity and changing it needs a confirmation round-trip.
 */
/**
 * One comma-separated line <-> a Postgres text[].
 *
 * Empty entries are dropped rather than stored, so a trailing comma — which is
 * what you get the moment someone pauses mid-typing and hits Save — does not
 * become a blank chip on their public profile. An empty result is stored as
 * NULL, not as `[]`: the member page tests `length > 0` either way, but NULL is
 * the honest value for "not stated" and keeps the column's meaning single.
 */
function toList(value: string): string[] | null {
  const items = value.split(',').map((v) => v.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

function fromList(value: string[] | null | undefined): string {
  return (value ?? []).join(', ');
}

export default function TrainerEditProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', specialization: '', bio: '', availability: '',
    yearsExperience: '', certifications: '', focusAreas: '', achievements: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await getCurrentTrainerId();
        if (!id) throw new Error('Not signed in');
        if (!cancelled) setTrainerId(id);
        const [profile, trainer] = await Promise.all([
          getMyProfile(),
          getTrainer(id).catch(() => null),
        ]);
        if (cancelled) return;
        setPhotoUrl(profile?.photo_url ?? null);
        setForm({
          firstName: profile?.first_name ?? '',
          lastName: profile?.last_name ?? '',
          phone: profile?.phone ?? '',
          specialization: trainer?.trainer.specialization ?? '',
          bio: trainer?.trainer.bio ?? '',
          availability: trainer?.trainer.availability ?? '',
          // Arrays are edited as one comma-separated line, which is what a
          // phone keyboard is good at. `?? ''` and not `?.join() ?? ''`: a
          // null column and an empty array both have to arrive as an empty
          // string, or the field renders the word "null".
          yearsExperience:
            trainer?.trainer.years_experience != null
              ? String(trainer.trainer.years_experience)
              : '',
          certifications: fromList(trainer?.trainer.certifications),
          focusAreas: fromList(trainer?.trainer.focus_areas),
          achievements: trainer?.trainer.achievements ?? '',
        });
      } catch (err) {
        toast.error(errorMessage(err, 'Could not load your profile'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const { publicUrl } = await uploadMyAvatar(file);
      setPhotoUrl(publicUrl);
      toast.success('Photo updated');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not upload that photo'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    try {
      await removeMyAvatar();
      setPhotoUrl(null);
      toast.success('Photo removed');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove that photo'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    // Checked here as well as by the CHECK constraint in 0041, because a
    // constraint violation surfaces as a Postgres error string and "new row
    // violates check constraint trainer_profiles_years_sane" is not a sentence
    // to show a trainer who typed their birth year.
    const years = form.yearsExperience.trim() === '' ? null : Number(form.yearsExperience);
    if (years != null && (!Number.isInteger(years) || years < 0 || years > 70)) {
      toast.error('Years coaching must be a whole number between 0 and 70');
      return;
    }
    setSaving(true);
    try {
      const id = await getCurrentTrainerId();
      if (!id) throw new Error('Not signed in');
      await updateMyProfile({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone.trim() || null,
      });
      await updateTrainerProfile(id, {
        specialization: form.specialization.trim() || null,
        bio: form.bio.trim() || null,
        availability: form.availability.trim() || null,
        years_experience: years,
        certifications: toList(form.certifications),
        focus_areas: toList(form.focusAreas),
        achievements: form.achievements.trim() || null,
      });
      toast.success('Profile updated');
      navigate('/trainer/profile');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your profile'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonList count={3} />;

  const fullName = `${form.firstName} ${form.lastName}`.trim();

  return (
    <div className="space-y-4 pb-4">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3">
        <button onClick={() => navigate('/trainer/profile')}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="display text-xl text-white">Edit profile</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            What members see on your profile
          </p>
        </div>
      </motion.div>

      {/* Photo */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-2xl p-4" style={panelStyle}>
        <div className="flex items-center gap-4">
          <div className="relative" style={{ opacity: photoBusy ? 0.5 : 1 }}>
            <Avatar name={fullName} photoUrl={photoUrl} size={72} />
            <label htmlFor="trainer-photo"
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border-2"
              style={{ background: 'var(--color-secondary)', borderColor: 'var(--color-surface-raised)' }}>
              <Camera size={12} className="text-black" />
            </label>
            <input id="trainer-photo" type="file" accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoPick} disabled={photoBusy} className="hidden" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Profile photo</p>
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
              JPG, PNG or WebP. Large photos are resized automatically.
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="trainer-photo"
                className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                {photoBusy ? 'Uploading…' : photoUrl ? 'Change' : 'Choose photo'}
              </label>
              {photoUrl && !photoBusy && (
                <button onClick={handleRemovePhoto}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: 'transparent', color: '#f87171', border: '1px solid var(--color-border)' }}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Details */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-2xl p-4 space-y-3" style={panelStyle}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="First name">
            <TextInput value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Last name">
            <TextInput value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
        </div>

        <Field label="Phone">
          <TextInput type="tel" value={form.phone} placeholder="+63 XXX XXX XXXX"
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>

        <Field label="Specialization" hint="Shown under your name, e.g. Strength & Conditioning">
          <TextInput value={form.specialization}
            onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
        </Field>

        <Field label="About you" hint="A short introduction members will read">
          <TextArea rows={4} value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </Field>

        {/* Background. Every one of these is optional and the member profile
            renders each section only when it is filled, so a coach who skips
            the lot gets the same clean page as before rather than a column of
            empty headings. */}
        <Field label="Years coaching" hint="Leave blank rather than guessing — blank shows nothing at all">
          <TextInput
            type="number"
            inputMode="numeric"
            min={0}
            max={70}
            value={form.yearsExperience}
            placeholder="e.g. 5"
            onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })}
          />
        </Field>

        <Field label="Trains for" hint="Separate with commas — e.g. Weight Loss, Strength, Rehab">
          <TextInput value={form.focusAreas} placeholder="Weight Loss, Strength"
            onChange={(e) => setForm({ ...form, focusAreas: e.target.value })} />
        </Field>

        <Field label="Certifications" hint="Separate with commas. Shown as your own statement — the gym does not verify them">
          <TextInput value={form.certifications} placeholder="NASM-CPT, First Aid / CPR"
            onChange={(e) => setForm({ ...form, certifications: e.target.value })} />
        </Field>

        {/* The document, next to the claim (0054). The field above is still the
            trainer's own statement and still says so; this is the separate
            thing the gym can actually check. */}
        {trainerId && <CredentialsSection trainerId={trainerId} />}

        <Field label="Background & achievements" hint="Competitions, athletic background, results you are proud of">
          <TextArea rows={4} value={form.achievements}
            onChange={(e) => setForm({ ...form, achievements: e.target.value })} />
        </Field>

        {/* Still description only — nothing generates a bookable slot from this
            text. The hint used to say "the gym sets your bookable hours", which
            stopped being true when the trainer got their own hours screen, so
            it now points there instead of at the front desk. */}
        <Field label="Availability note" hint="Just a description members read — it doesn't create slots">
          <TextInput value={form.availability} placeholder="e.g. Mornings and weekends"
            onChange={(e) => setForm({ ...form, availability: e.target.value })} />
        </Field>

        <button
          type="button"
          onClick={() => navigate('/trainer/availability')}
          className="w-full p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--color-primary-light)' }}>
            <Clock size={16} style={{ color: 'var(--color-primary)' }} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-white">Set your bookable hours</span>
            <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              The real times members can book
            </span>
          </span>
          <ChevronRight size={16} className="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        onClick={save} disabled={saving}
        className="w-full py-3.5 rounded-full text-sm font-bold text-black flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] transition-transform"
        style={{ background: 'var(--color-secondary)' }}>
        <Save size={16} /> {saving ? 'Saving…' : 'Save changes'}
      </motion.button>
    </div>
  );
}
