import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, LifeBuoy, Lock, RefreshCw } from 'lucide-react';
import Button from '../components/ui/Button';
import { showToast } from '../utils/toast';
import {
  getGymApp, getGymModules, getSupportGrant, grantSupportAccess, revokeSupportAccess,
  saveGymWords, setGymModule, setJoinPolicy,
  type GymApp as App, type GymModule, type JoinPolicy, type SupportGrant,
} from '../lib/api/gymApp';

const MEMBER_APP = 'https://corefitness-gym.vercel.app';

/**
 * Your app — what this gym's members see, in this gym's words.
 *
 * Three things live here, and they are three because they answer to different
 * people (0110):
 *
 *   What it says   the gym's own words for its points and its welcome
 *   What it runs   which parts of the system this gym actually uses
 *   How they join  listed, by code, or only at the desk
 *
 * "What it runs" shows a plan lock rather than a switch for anything the gym's
 * Core Fitness plan does not include — offering a switch that would be refused
 * is a control writing a flag nothing honours (CLAUDE.md).
 */
export default function GymApp() {
  const [app, setApp] = useState<App | null>(null);
  const [modules, setModules] = useState<GymModule[]>([]);
  const [words, setWords] = useState({ points_name: '', points_name_short: '', welcome_message: '' });
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  /** A live invitation to Core Fitness to look at this gym (0113). */
  const [support, setSupport] = useState<SupportGrant | null>(null);
  /** The reason box, open. window.prompt() does nothing in an embedded browser
      — it throws "prompt() is not supported" and the button looks dead, which
      is the same bug the platform app already had and fixed. */
  const [asking, setAsking] = useState<number | null>(null);
  const [why, setWhy] = useState('');

  const load = useCallback(async () => {
    const [a, m, sup] = await Promise.all([getGymApp(), getGymModules(), getSupportGrant()]);
    setApp(a);
    setModules(m);
    setSupport(sup);
    if (a) {
      setWords({
        points_name: a.points_name,
        points_name_short: a.points_name_short,
        welcome_message: a.welcome_message ?? '',
      });
    }
    setReady(true);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const toggle = async (m: GymModule) => {
    if (m.state === 'not_sold') return;
    try {
      await setGymModule(m.feature_key, !m.enabled);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    }
  };

  const saveWords = async () => {
    setSaving(true);
    try {
      await saveGymWords({
        points_name: words.points_name.trim(),
        points_name_short: words.points_name_short.trim() || null,
        welcome_message: words.welcome_message.trim() || null,
      });
      await load();
      showToast('Saved. Your members see this next time they open the app.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeDoor = async (policy: JoinPolicy, newCode = false) => {
    try {
      await setJoinPolicy(policy, newCode);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That could not be saved', 'error');
    }
  };

  if (!ready) {
    return <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>;
  }

  if (!app) {
    return (
      <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Not available yet
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          This page needs migration 0110, which has not been pasted into the database yet. Nothing is
          broken — your gym works exactly as it did.
        </p>
      </div>
    );
  }

  const joinLink = `${MEMBER_APP}/join/${app.slug}`;
  const card = 'rounded-xl border p-5';
  const cardStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface)' };
  const label = 'block text-xs mb-1';
  const labelStyle = { color: 'var(--color-text-secondary)' };
  const input = 'w-full rounded-lg border px-3 py-2 text-sm';
  const inputStyle = {
    borderColor: 'var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text-primary)',
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Your app</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          What {app.gym_name}'s members see on their phones. Your name, logo and colour are on
          Settings; this is everything else.
        </p>
      </div>

      {/* ---- what it says ---------------------------------------------------- */}
      <div className={card} style={cardStyle}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          What it says
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Your members earn points for turning up and logging workouts. Call them whatever your gym
          calls them — the whole app follows.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} style={labelStyle} htmlFor="pn">Your points are called</label>
            <input id="pn" className={input} style={inputStyle} maxLength={30} value={words.points_name}
              placeholder="Points"
              onChange={(e) => setWords({ ...words, points_name: e.target.value })} />
          </div>
          <div>
            <label className={label} style={labelStyle} htmlFor="pns">In the middle of a sentence</label>
            <input id="pns" className={input} style={inputStyle} maxLength={30} value={words.points_name_short}
              placeholder="points"
              onChange={(e) => setWords({ ...words, points_name_short: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} style={labelStyle} htmlFor="wm">
              A line on your members' home screen (optional)
            </label>
            <input id="wm" className={input} style={inputStyle} maxLength={280} value={words.welcome_message}
              placeholder="Open 5am–10pm. Ask the desk about the new squat racks."
              onChange={(e) => setWords({ ...words, welcome_message: e.target.value })} />
          </div>
        </div>
        <p className="mt-3 text-xs" style={labelStyle}>
          Preview: “You earned 20 {words.points_name_short.trim() || 'points'} for checking in.
          {' '}{(words.points_name.trim() || 'Points')}: 340.”
        </p>
        <Button className="mt-4" onClick={() => void saveWords()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {/* ---- what it runs ---------------------------------------------------- */}
      <div className={card} style={cardStyle}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          What your gym runs
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Switch off anything your gym does not do. It disappears from your members' app and from
          this dashboard — nothing is deleted, and switching it back on brings everything with it.
        </p>
        <div className="mt-4 space-y-2">
          {modules.map((m) => {
            const locked = m.state === 'not_sold';
            return (
              <button
                key={m.feature_key}
                type="button"
                onClick={() => void toggle(m)}
                disabled={locked}
                className="w-full flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left disabled:cursor-default"
                style={{
                  borderColor: m.enabled ? 'var(--color-primary)' : 'var(--color-border)',
                  background: 'var(--color-bg)',
                  opacity: locked ? 0.6 : 1,
                }}
              >
                <span className="mt-0.5 shrink-0">
                  {locked ? <Lock size={16} style={{ color: 'var(--color-text-muted)' }} />
                    : m.enabled ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
                    : <span className="block h-4 w-4 rounded border" style={{ borderColor: 'var(--color-border)' }} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {m.label}
                  </span>
                  <span className="block text-xs mt-0.5" style={labelStyle}>
                    {locked
                      ? 'Your Core Fitness plan does not include this. Ask us to move you to a plan that does.'
                      : m.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- letting us look -------------------------------------------------- */}
      <div className={card} style={cardStyle}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Support access
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          If something here is wrong and we cannot work it out from a description, you can let Core
          Fitness look at your gym for a few hours. We can only ever look — the database refuses us
          every change while your access is open — and it ends by itself.
        </p>

        {support ? (
          <div className="mt-4 rounded-lg border p-3.5"
            style={{ borderColor: 'var(--color-primary)', background: 'var(--color-bg)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
              Open for another {Number(support.hours_left).toFixed(1)} hours
            </p>
            <p className="mt-1 text-xs" style={labelStyle}>
              {support.reason ? `You wrote: "${support.reason}". ` : ''}
              {support.first_used_at
                ? 'We have looked at least once, and every visit is in your activity log.'
                : 'Nobody has looked yet. Every visit is written into your activity log.'}
            </p>
            <Button variant="ghost" className="mt-3" onClick={() => void (async () => {
              try { await revokeSupportAccess(); await load(); showToast('Support access withdrawn.', 'success'); }
              catch (e) { showToast(e instanceof Error ? e.message : 'That did not work', 'error'); }
            })()}>
              Withdraw it now
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              {[1, 4, 24].map((h) => (
                <Button key={h} variant="ghost" onClick={() => { setAsking(h); setWhy(''); }}>
                  <LifeBuoy size={14} className="mr-1.5" />
                  {h === 24 ? 'For a day' : h === 1 ? 'For an hour' : `For ${h} hours`}
                </Button>
              ))}
            </div>

            {asking !== null && (
              <form
                className="mt-3 rounded-lg border p-3.5"
                style={{ borderColor: 'var(--color-primary)', background: 'var(--color-bg)' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void (async () => {
                    try {
                      await grantSupportAccess(asking, why.trim() || null);
                      setAsking(null);
                      await load();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'That did not work', 'error');
                    }
                  })();
                }}
              >
                <label className={label} style={labelStyle} htmlFor="sup-why">
                  What should we look at?
                </label>
                <input id="sup-why" className={input} style={inputStyle} value={why} autoFocus
                  maxLength={200} placeholder="The members page shows nobody since Tuesday"
                  onChange={(e) => setWhy(e.target.value)} />
                <p className="mt-2 text-xs" style={labelStyle}>
                  This is written into your own activity log, next to every visit we make.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button type="submit">
                    Open for {asking === 24 ? 'a day' : asking === 1 ? 'an hour' : `${asking} hours`}
                  </Button>
                  <Button variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
                </div>
              </form>
            )}
            <p className="mt-2 text-xs" style={labelStyle}>
              Nobody at Core Fitness can give themselves this. It only exists while you offer it.
            </p>
          </div>
        )}
      </div>

      {/* ---- how they join --------------------------------------------------- */}
      <div className={card} style={cardStyle}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          How members join
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          However they arrive, you still approve every sign-up before they can use anything.
        </p>
        <div className="mt-4 space-y-2">
          {([
            ['open', 'Anyone can find you', `${app.gym_name} is listed in the app's gym list. Anyone with the app can search for you and ask to join.`],
            ['code', 'Only with your link or code', 'You are not listed. Members join with the link below, or by typing your join code.'],
            ['closed', 'Only at the front desk', 'Nobody can ask to join from the app. Your desk creates every member account.'],
          ] as const).map(([key, title, blurb]) => (
            <button key={key} type="button" onClick={() => void changeDoor(key)}
              className="w-full flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left"
              style={{
                borderColor: app.join_policy === key ? 'var(--color-primary)' : 'var(--color-border)',
                background: 'var(--color-bg)',
              }}>
              <span className="mt-0.5 shrink-0">
                {app.join_policy === key
                  ? <Check size={16} style={{ color: 'var(--color-primary)' }} />
                  : <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--color-border)' }} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
                <span className="block text-xs mt-0.5" style={labelStyle}>{blurb}</span>
              </span>
            </button>
          ))}
        </div>

        {app.join_policy !== 'closed' && (
          <div className="mt-4 rounded-lg border p-3.5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
            <p className="text-xs" style={labelStyle}>Give your members either of these</p>
            <p className="mt-1.5 text-sm break-all" style={{ color: 'var(--color-text-primary)' }}>{joinLink}</p>
            {app.join_code && (
              <p className="mt-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
                Join code: <strong style={{ letterSpacing: '0.12em' }}>{app.join_code}</strong>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => {
                void navigator.clipboard.writeText(
                  app.join_code ? `${joinLink}\nJoin code: ${app.join_code}` : joinLink
                ).then(() => setCopied(true));
              }}>
                <Copy size={14} className="mr-1.5" /> {copied ? 'Copied' : 'Copy'}
              </Button>
              {app.join_policy === 'code' && (
                <Button variant="ghost" onClick={() => void changeDoor('code', true)}>
                  <RefreshCw size={14} className="mr-1.5" /> New code
                </Button>
              )}
            </div>
            {app.join_policy === 'code' && (
              <p className="mt-2 text-xs" style={labelStyle}>
                A new code stops the old one working straight away — use it if your code gets out.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
