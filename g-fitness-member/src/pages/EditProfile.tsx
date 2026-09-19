import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowCounterClockwise, Camera, CaretRight, EnvelopeSimple, Key, Lifebuoy } from '@phosphor-icons/react';
import { toast } from '../components/ui/Toast';
import { errorMessage } from '../utils/errorMessage';
import { getMyProfile, updateMyProfile } from '../lib/api/profiles';
import { getMemberProfile, isPhoneTaken, updateMemberProfile } from '../lib/api/members';
import { Field, TextInput, FieldError } from '../components/ui/Field';
import Avatar from '../components/ui/Avatar';
import BirthDateField from '../components/ui/BirthDateField';
import { uploadMyAvatar, removeMyAvatar } from '../lib/api/avatars';
import { ageFrom, birthDateProblem, GENDER_OPTIONS, PHONE_RE } from '../utils/profileRules';
import { Page, PageTitle } from '../components/ui/page';
import { Chip, NocButton, Panel, ProgressBar, SectionHead } from '../components/ui/noc';
import { SkeletonList } from '../components/ui/Skeleton';

/**
 * Edit profile (reworked 2026-09-19).
 *
 * **Everything you gave at sign-up, editable** — name and phone (`profiles`),
 * and birth date, gender, address and emergency contact (`member_profiles`).
 * The last four were collected by Register and shown to the front desk in the
 * member drawer, but a member could never change them afterwards: a new number
 * for your emergency contact had to be phoned in, if anyone thought to.
 *
 * The rules are Register's (`utils/profileRules.ts`), so the two screens cannot
 * disagree again — they did: this screen demanded "+63 XXX XXX XXXX" and a phone
 * at all, so a member registered without one could not save any change here.
 *
 * The password fields that duplicated Change password are gone; that screen and
 * Change email are one tap away. Saving is a bar that appears only while there
 * are changes, so a long form never hides its Save below the fold.
 */

type Form = {
  firstName: string; lastName: string; phone: string;
  dateOfBirth: string; gender: string; address: string;
  emergencyName: string; emergencyPhone: string; emergencyRelationship: string;
};

const EMPTY: Form = {
  firstName: '', lastName: '', phone: '', dateOfBirth: '', gender: '', address: '',
  emergencyName: '', emergencyPhone: '', emergencyRelationship: '',
};

const RELATIONSHIPS = ['Parent', 'Spouse', 'Partner', 'Sibling', 'Child', 'Friend'];

export default function EditProfile() {
  const navigate = useNavigate();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [photo, setPhoto] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getMyProfile();
        if (!profile) throw new Error('Your profile could not be loaded.');
        const member = await getMemberProfile(profile.id).catch(() => null);
        if (cancelled) return;
        const m = member?.member;
        const loaded: Form = {
          firstName: profile.first_name ?? '', lastName: profile.last_name ?? '', phone: profile.phone ?? '',
          dateOfBirth: m?.date_of_birth ?? '', gender: m?.gender ?? '', address: m?.address ?? '',
          emergencyName: m?.emergency_contact_name ?? '', emergencyPhone: m?.emergency_contact_phone ?? '',
          emergencyRelationship: m?.emergency_contact_relationship ?? '',
        };
        setMemberId(profile.id);
        setEmail(profile.email);
        setPhoto(profile.photo_url ?? null);
        setSaved(loaded);
        setForm(loaded);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, 'Your profile could not be loaded.'));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = (k: keyof Form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const dirty = saved != null && (Object.keys(form) as (keyof Form)[]).some((k) => form[k].trim() !== saved[k].trim());

  // How complete the record is — the fields the desk relies on, photo included.
  const completeness = useMemo(() => {
    const checks: [string, boolean][] = [
      ['a photo', !!photo],
      ['your phone', !!form.phone.trim()],
      ['your birth date', !!form.dateOfBirth],
      ['your address', !!form.address.trim()],
      ['an emergency contact', !!form.emergencyName.trim() && !!form.emergencyPhone.trim()],
    ];
    const done = checks.filter(([, ok]) => ok).length + 1; // the name is always there
    return { fraction: done / (checks.length + 1), missing: checks.filter(([, ok]) => !ok).map(([k]) => k) };
  }, [form, photo]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      // Uploads on pick — the member sees the stored image, not a preview.
      const { publicUrl } = await uploadMyAvatar(file);
      setPhoto(publicUrl);
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
      setPhoto(null);
      toast.success('Photo removed');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove that photo'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const validate = async (): Promise<boolean> => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    if (form.phone.trim()) {
      if (!PHONE_RE.test(form.phone.trim())) e.phone = 'That phone number does not look right';
      else if (form.phone.trim() !== (saved?.phone ?? '').trim() && await isPhoneTaken(form.phone))
        e.phone = 'That number is already on another account. Ask the front desk if it is yours.';
    }
    if (form.dateOfBirth) {
      const p = birthDateProblem(form.dateOfBirth);
      if (p) e.dateOfBirth = p;
    }
    if (form.emergencyPhone.trim() && !PHONE_RE.test(form.emergencyPhone.trim()))
      e.emergencyPhone = 'That number does not look right';
    if (form.emergencyPhone.trim() && !form.emergencyName.trim()) e.emergencyName = 'Whose number is it?';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!memberId || !saved) return;
    setSaving(true);
    try {
      if (!(await validate())) {
        toast.error('Please fix the highlighted fields');
        return;
      }
      const t = (v: string) => v.trim() || null;
      if (form.firstName !== saved.firstName || form.lastName !== saved.lastName || form.phone !== saved.phone) {
        await updateMyProfile({ first_name: form.firstName.trim(), last_name: form.lastName.trim(), phone: t(form.phone) });
      }
      await updateMemberProfile(memberId, {
        date_of_birth: form.dateOfBirth || null,
        gender: form.gender || null,
        address: t(form.address),
        emergency_contact_name: t(form.emergencyName),
        emergency_contact_phone: t(form.emergencyPhone),
        emergency_contact_relationship: t(form.emergencyRelationship),
      });
      setSaved(form);
      toast.success('Saved — the front desk sees the new details');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your profile'));
    } finally {
      setSaving(false);
    }
  };

  /** An error edge in the action colour — the design system has no red. */
  const edge = (key: string) => (errors[key] ? { borderColor: 'var(--color-secondary)' } : undefined);
  const age = form.dateOfBirth ? ageFrom(form.dateOfBirth) : null;

  if (loadError) {
    return (
      <Page>
        <PageTitle back fallback="/member/profile" title="Edit profile" />
        <p style={{ fontSize: 13, color: 'var(--color-secondary)' }}>{loadError}</p>
      </Page>
    );
  }
  if (!saved) return <Page><PageTitle back fallback="/member/profile" title="Edit profile" /><SkeletonList count={4} /></Page>;

  return (
    <Page>
      <PageTitle back fallback="/member/profile" title="Edit profile" subtitle="What the gym has on file — yours to keep current" />

      {/* ── Photo and completeness ── */}
      <Panel glow={completeness.missing.length ? 'action' : 'structure'}>
        <div className="flex items-center" style={{ gap: 16 }}>
          <label htmlFor="photo-upload" className="relative flex-none cursor-pointer noc-press" aria-label="Choose a profile photo"
            style={{ opacity: photoBusy ? 0.5 : 1 }}>
            <Avatar name={`${form.firstName} ${form.lastName}`.trim()} photoUrl={photo} size={76} />
            <span className="absolute grid place-items-center" aria-hidden style={{
              right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14,
              background: 'var(--color-secondary)', color: 'var(--color-bg)', border: '2px solid var(--color-bg)',
            }}>
              <Camera size={14} weight="fill" />
            </span>
          </label>
          <input id="photo-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange}
            disabled={photoBusy} className="hidden" />
          <div className="flex-1 min-w-0">
            <p className="truncate" style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {`${form.firstName} ${form.lastName}`.trim() || 'Your name'}
            </p>
            <p className="truncate" style={{ fontSize: 12.5, marginTop: 2, color: 'var(--color-text-muted)' }}>{email}</p>
            <div className="flex items-center" style={{ gap: 14, marginTop: 8, fontSize: 13 }}>
              <label htmlFor="photo-upload" className="cursor-pointer" style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>
                {photoBusy ? 'Uploading…' : photo ? 'Change photo' : 'Add a photo'}
              </label>
              {photo && !photoBusy && (
                <button type="button" onClick={() => void handleRemovePhoto()} style={{ color: 'var(--color-text-secondary)' }}>Remove</button>
              )}
            </div>
          </div>
        </div>
        <ProgressBar style={{ marginTop: 16 }} fraction={completeness.fraction} tone={completeness.missing.length ? 'action' : 'structure'} />
        <p style={{ fontSize: 12, marginTop: 7, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
          {completeness.missing.length === 0
            ? 'Complete — the front desk has everything it needs.'
            : `Still missing: ${completeness.missing.join(', ')}.`}
        </p>
      </Panel>

      {/* ── Name ── */}
      <section className="flex flex-col" style={{ gap: 12 }}>
        <SectionHead title="Name" />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div>
            <Field label="First name">
              <TextInput autoComplete="given-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} style={edge('firstName')} />
            </Field>
            {errors.firstName && <FieldError>{errors.firstName}</FieldError>}
          </div>
          <div>
            <Field label="Last name">
              <TextInput autoComplete="family-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} style={edge('lastName')} />
            </Field>
            {errors.lastName && <FieldError>{errors.lastName}</FieldError>}
          </div>
        </div>
      </section>

      {/* ── About you ── */}
      <section className="flex flex-col" style={{ gap: 12 }}>
        <SectionHead title="About you" meta={age != null && age >= 0 ? `${age} years old` : undefined} />
        <div>
          <BirthDateField value={form.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} />
          {errors.dateOfBirth && <FieldError>{errors.dateOfBirth}</FieldError>}
        </div>
        <div>
          <p style={{ fontSize: 12.5, marginBottom: 8, color: 'var(--color-text-secondary)' }}>Gender</p>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {GENDER_OPTIONS.map((g) => (
              <Chip key={g.value} label={g.label} on={form.gender === g.value} onClick={() => set('gender', form.gender === g.value ? '' : g.value)} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section className="flex flex-col" style={{ gap: 12 }}>
        <SectionHead title="Contact" />
        <div>
          <Field label="Phone number" hint="The desk uses it for your membership — renewals, freezes, a class moved.">
            <TextInput type="tel" autoComplete="tel" inputMode="tel" value={form.phone} placeholder="0917 123 4567"
              onChange={(e) => set('phone', e.target.value)} style={edge('phone')} />
          </Field>
          {errors.phone && <FieldError>{errors.phone}</FieldError>}
        </div>
        <Field label="Address" hint="Optional — Mamburao barangay is enough.">
          <TextInput autoComplete="street-address" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </section>

      {/* ── Emergency contact ── */}
      <section className="flex flex-col" style={{ gap: 12 }}>
        <SectionHead title="Emergency contact" meta="Who the gym calls if something happens" />
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div>
            <Field label="Name">
              <TextInput value={form.emergencyName} onChange={(e) => set('emergencyName', e.target.value)} style={edge('emergencyName')} />
            </Field>
            {errors.emergencyName && <FieldError>{errors.emergencyName}</FieldError>}
          </div>
          <div>
            <Field label="Phone">
              <TextInput type="tel" inputMode="tel" value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} style={edge('emergencyPhone')} />
            </Field>
            {errors.emergencyPhone && <FieldError>{errors.emergencyPhone}</FieldError>}
          </div>
        </div>
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {RELATIONSHIPS.map((r) => (
            <Chip key={r} label={r} on={form.emergencyRelationship === r} onClick={() => set('emergencyRelationship', form.emergencyRelationship === r ? '' : r)} />
          ))}
        </div>
        {form.emergencyRelationship && !RELATIONSHIPS.includes(form.emergencyRelationship) && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>On file: {form.emergencyRelationship}</p>
        )}
      </section>

      {/* ── Sign-in ── */}
      <section>
        <SectionHead title="Sign-in" />
        {[
          { icon: EnvelopeSimple, label: 'Change email', meta: email, to: '/member/change-email' },
          { icon: Key, label: 'Change password', meta: 'Needs your current password', to: '/member/change-password' },
        ].map(({ icon: Icon, label, meta, to }, i) => (
          <button key={to} onClick={() => navigate(to)} className="w-full flex items-center text-left noc-press-soft"
            style={{ gap: 12, padding: '13px 0', borderBottom: i === 0 ? '1px solid var(--color-separator)' : 'none' }}>
            <Icon size={18} style={{ color: 'var(--color-primary-300)' }} aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="block" style={{ fontSize: 14.5, color: 'var(--color-text-primary)' }}>{label}</span>
              <span className="block truncate" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>{meta}</span>
            </span>
            <CaretRight size={14} style={{ color: 'var(--color-text-muted)' }} aria-hidden />
          </button>
        ))}
      </section>

      <p className="flex items-start" style={{ gap: 8, fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
        <Lifebuoy size={14} className="flex-none" style={{ marginTop: 2 }} aria-hidden />
        Your check-in code and membership are set by the front desk and cannot be changed here.
      </p>

      {/* ── Unsaved changes ── clear of the assistant bubble on the right. */}
      {dirty && (
        <div role="region" aria-label="Unsaved changes" style={{
          position: 'sticky', bottom: 12, zIndex: 5, marginRight: 66,
          display: 'flex', alignItems: 'center', gap: 8, padding: 8,
          borderRadius: 20, background: 'var(--color-surface-raised)', border: '1px solid var(--color-hairline)',
          boxShadow: '0 12px 32px -12px rgba(0,0,0,0.75)',
        }}>
          <button onClick={() => { setForm(saved); setErrors({}); }} disabled={saving}
            className="flex-none inline-flex items-center noc-press-soft"
            style={{ gap: 6, height: 44, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            <ArrowCounterClockwise size={15} aria-hidden /> Undo
          </button>
          <NocButton variant="fill" className="flex-1" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </NocButton>
        </div>
      )}
    </Page>
  );
}
