import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Check, MessageCircle, QrCode, UserRound, Inbox } from 'lucide-react';
import { Page, PageTitle } from '../../components/ui/page';
import { NocButton, Panel, ProgressBar } from '../../components/ui/noc';
import { supabase } from '../../lib/supabaseClient';
import { useT } from '../../lib/i18n';
import { useGymBrand } from '../../hooks/useGymBrand';

interface Setup { onboarded: boolean; photo: boolean; bio: boolean; hours: number; pt_approval: string | null; coach_checkin: boolean }

/** How this gym's 1-on-1 bookings reach a coach, in the coach's words (0204's modes). */
const PT_WORDS: Record<string, string> = {
  instant: 'Members book your open hours and it is confirmed straight away — you see it on Bookings.',
  coach: 'A member asks for a time and you accept or decline it on Bookings. You decide your own bookings.',
  desk: 'A member asks for a time and the front desk confirms it. You see it on Bookings once it is.',
  coach_desk: 'You accept a member’s request first, then the front desk confirms it.',
  off: 'Your gym books 1-on-1 sessions at the front desk, not in the app. They still show on Bookings.',
};

/**
 * A coach's first sign-in (0212): five steps, each ticked from what is really
 * set — a photo and a bio members read, weekly hours members can book, how this
 * gym's 1-on-1s reach you, your check-in code (when the owner has coach
 * check-in on), and where messages and rooms are. "I'm set" marks it done in
 * the database, so another phone does not ask again; "Later" comes back next time.
 */
export default function TrainerSetup() {
  const t = useT();
  const navigate = useNavigate();
  const gym = useGymBrand();
  const [s, setS] = useState<Setup | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [first, setFirst] = useState('');

  useEffect(() => {
    void (async () => {
      const [{ data, error }, me] = await Promise.all([supabase.rpc('my_coach_setup'), supabase.auth.getUser()]);
      setS(error ? null : (data as Setup | null));
      const uid = me.data.user?.id;
      if (uid) {
        const { data: p } = await supabase.from('profiles').select('first_name').eq('id', uid).maybeSingle();
        setFirst((p as { first_name?: string } | null)?.first_name ?? '');
      }
    })();
  }, []);

  const finish = async () => {
    setBusy(true);
    await supabase.rpc('finish_coach_setup');
    navigate('/trainer/home', { replace: true });
  };
  const later = () => {
    try { sessionStorage.setItem('cf-coach-setup-later', '1'); } catch { /* the hub asks again next time */ }
    navigate('/trainer/home', { replace: true });
  };

  if (s === undefined) return <Page><p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('Loading…')}</p></Page>;
  if (s === null) { navigate('/trainer/home', { replace: true }); return null; }

  const steps: { icon: typeof Check; title: string; body: string; done: boolean | null; go?: [string, string] }[] = [
    { icon: UserRound, title: t('Your photo and a few words'), done: s.photo && s.bio,
      body: t('Members choose a coach by face and by what you do. Add a photo, your specialty and a short bio.'),
      go: ['/trainer/profile/edit', t('Edit my profile')] },
    { icon: CalendarClock, title: t('Your weekly hours'), done: s.hours > 0,
      body: s.hours > 0 ? t('Members can book you in these hours. Change them any time.') : t('Set the hours you coach each week — members book 1-on-1s only inside them.'),
      go: ['/trainer/availability', s.hours > 0 ? t('See my hours') : t('Set my hours')] },
    { icon: Inbox, title: t('How 1-on-1s reach you'), done: null,
      body: t(PT_WORDS[s.pt_approval ?? 'coach'] ?? PT_WORDS.coach), go: ['/trainer/bookings', t('Open Bookings')] },
    ...(s.coach_checkin ? [{ icon: QrCode, title: t('Check in when you arrive'), done: null,
      body: t('Your gym checks coaches in too. On your hub, tap the violet QR button in the bar at the bottom and hold your code up at the desk or the kiosk.') }] : []),
    { icon: MessageCircle, title: t('Messages and rooms'), done: null,
      body: t('Your hub is like a chat app: Messages has each 1-on-1 member, and the rail on the left has your class and group rooms — posts, classwork and members.') },
  ];
  const todo = steps.filter((x) => x.done !== null);
  const done = todo.filter((x) => x.done).length;

  return (
    <Page>
      <PageTitle title={first ? `${t('Welcome, Coach')} ${first}` : t('Welcome, Coach')}
        subtitle={gym?.gymName ? `${t('A few things to set up at')} ${gym.gymName}` : t('A few things to set up')} />
      <Panel glow="structure" className="flex flex-col" style={{ gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{done} {t('of')} {todo.length} {t('set')}</span>
        <ProgressBar fraction={todo.length ? done / todo.length : null} />
      </Panel>
      <div className="flex flex-col" style={{ gap: 10, marginTop: 12 }} data-coach-setup>
        {steps.map((x) => (
          <Panel key={x.title} className="flex" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span className="grid place-items-center flex-none" style={{ width: 36, height: 36, borderRadius: 12,
              background: x.done ? 'color-mix(in srgb, var(--color-primary) 25%, transparent)' : 'var(--color-surface-high)', color: x.done ? 'var(--color-primary-300)' : 'var(--color-text-secondary)' }}>
              {x.done ? <Check size={17} /> : <x.icon size={17} />}
            </span>
            <div className="min-w-0" style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 650, color: '#fff' }}>{x.title}</p>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 2 }}>{x.body}</p>
              {x.go && (
                <button type="button" onClick={() => navigate(x.go![0])} style={{ marginTop: 6, fontSize: 13, fontWeight: 650, color: x.done ? 'var(--color-primary-300)' : 'var(--color-secondary)' }}>
                  {x.go[1]} →
                </button>
              )}
            </div>
          </Panel>
        ))}
      </div>
      <div className="flex flex-col" style={{ gap: 8, marginTop: 16, marginBottom: 24 }}>
        <NocButton onClick={() => void finish()} disabled={busy}>{busy ? t('Saving…') : t('I’m set — take me to my hub')}</NocButton>
        <NocButton variant="ghost" onClick={later}>{t('Later')}</NocButton>
      </div>
    </Page>
  );
}
