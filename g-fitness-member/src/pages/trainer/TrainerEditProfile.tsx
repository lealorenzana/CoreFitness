import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import { Field, TextInput, TextArea } from '../../components/ui/Field';
import { SkeletonList } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { errorMessage } from '../../utils/errorMessage';
import CredentialsSection from '../../components/ui/CredentialsSection';
import { getMyProfile, updateMyProfile } from '../../lib/api/profiles';
import { getTrainer, updateTrainerProfile } from '../../lib/api/trainers';
import { uploadMyAvatar, removeMyAvatar } from '../../lib/api/avatars';
import { getCurrentTrainerId } from '../../services/trainerService';
import { Page, PageTitle } from '../../components/ui/page';
import { LineRow, NocButton, SectionHead } from '../../components/ui/noc';

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
    <Page>
      <PageTitle back fallback="/trainer/profile" title="Edit profile" subtitle="What members see on your profile" />

      {/* Photo — the member Edit profile's layout. */}
      <section className="flex items-center" style={{ gap: 16 }}>
        <label htmlFor="trainer-photo" className="flex-none cursor-pointer" style={{ opacity: photoBusy ? 0.5 : 1 }}
          aria-label="Choose a profile photo">
          <Avatar name={fullName} photoUrl={photoUrl} size={76} />
        </label>
        <input id="trainer-photo" type="file" accept="image/jpeg,image/png,image/webp"
          onChange={handlePhotoPick} disabled={photoBusy} className="hidden" />
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>Profile photo</p>
          <p style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45, color: 'var(--color-text-muted)' }}>
            JPG, PNG or WebP. Large photos are resized automatically.
          </p>
          <div className="flex items-center" style={{ gap: 16, marginTop: 8, fontSize: 13 }}>
            <label htmlFor="trainer-photo" className="cursor-pointer" style={{ color: 'var(--color-secondary)' }}>
              {photoBusy ? 'Uploading…' : photoUrl ? 'Change photo' : 'Choose photo'}
            </label>
            {photoUrl && !photoBusy && (
              <button type="button" onClick={handleRemovePhoto} style={{ color: 'var(--color-text-secondary)' }}>
                Remove
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="rule" style={{ marginTop: -8 }} />

      <section className="flex flex-col" style={{ gap: 14 }}>
        <SectionHead title="Name and contact" />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Field label="First name">
            <TextInput value={form.firstName} autoComplete="given-name"
              onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Last name">
            <TextInput value={form.lastName} autoComplete="family-name"
              onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
        </div>

        <Field label="Phone">
          <TextInput type="tel" value={form.phone} placeholder="+63 XXX XXX XXXX" autoComplete="tel"
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </section>

      <section className="flex flex-col" style={{ gap: 14 }}>
        <SectionHead title="Your coaching" />
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
            the lot gets a clean page rather than a column of empty headings. */}
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
      </section>

      <section className="flex flex-col" style={{ gap: 14 }}>
        <SectionHead title="Availability" />
        {/* Still description only — nothing generates a bookable slot from this
            text, so the real hours screen sits right under it. */}
        <Field label="Availability note" hint="Just a description members read — it doesn't create slots">
          <TextInput value={form.availability} placeholder="e.g. Mornings and weekends"
            onChange={(e) => setForm({ ...form, availability: e.target.value })} />
        </Field>
        <div>
          <LineRow title="Set your bookable hours" meta="The real times members can book" action="Open" actionTone="structure"
            onClick={() => navigate('/trainer/availability')} last />
        </div>
      </section>

      <NocButton variant="fill" className="w-full" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </NocButton>
    </Page>
  );
}
