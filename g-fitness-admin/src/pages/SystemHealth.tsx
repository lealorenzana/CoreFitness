import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Bug, FlaskConical, HardDriveDownload } from 'lucide-react';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { PageHeader, Section, SectionTabs, StatTiles } from '../components/ui/kit';
import { supabase } from '../lib/supabaseClient';
import { showToast } from '../utils/toast';
import { getDemoDataSummary, type DemoSummary } from '../lib/api/settings';
import { SETTINGS_TABS } from '../components/ui/settingsTabs';


/**
 * Every migration since 0074 declares `migration_NNNN_applied()`, so whether it
 * is live is one REST call — the same test `scripts/probe-migrations.py` runs.
 *
 * **The end of this range is the whole check.** It read 103 while fourteen
 * migrations had shipped past it, so this page said "everything up to 0103 is
 * live" on a database that was missing every one of them: a check that could
 * not fail. `scripts/probe-migrations.py` is the list that gets updated
 * reliably, because a migration is not finished until its entry is there — so
 * the honest fix is to keep this end matching the probe's last row, and the
 * comment on that file says the same thing back.
 */
const LAST = 121;
const CHECKED = Array.from({ length: LAST - 74 + 1 }, (_, i) => String(74 + i).padStart(4, '0'));

interface ErrorRow {
  id: string; created_at: string; app: 'member' | 'admin'; route: string | null;
  message: string; stack: string | null; user_agent: string | null; build: string | null;
}

interface ErrorGroup { message: string; app: string; count: number; last: ErrorRow; routes: Set<string> }

/**
 * System health (2026-09-19): which migrations are live, and what has crashed.
 *
 * The migrations list answers "was 0093 pasted?" without a script — the thing
 * CLAUDE.md warns was once believed done for a day and never ran. Crash reports
 * come from `client_errors` (0095), filed by lib/errorReporter.ts in both apps.
 * Opening this page also prunes reports older than 60 days.
 */
export default function SystemHealth() {
  const [pending, setPending] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<ErrorRow[] | null>(null);
  const [errorsMissing, setErrorsMissing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  /** When the reports were read — "last 24 h" is measured from here, keeping render pure. */
  const [loadedAt, setLoadedAt] = useState(0);
  /** Seeded rows, counted (0117). Null = this database has no 0117, which
      renders nothing: "no demo data" and "cannot tell" are different sentences. */
  const [demo, setDemo] = useState<DemoSummary | null>(null);

  const load = useCallback(async () => {
    const results = await Promise.all(CHECKED.map(async (n) => {
      const { error } = await supabase.rpc(`migration_${n}_applied`);
      return error ? n : null;
    }));
    setPending(results.filter((n): n is string => n !== null));
    await supabase.rpc('prune_client_errors').then(() => undefined, () => undefined);
    const { data, error } = await supabase.from('client_errors')
      .select('id, created_at, app, route, message, stack, user_agent, build')
      .order('created_at', { ascending: false }).limit(300);
    setErrorsMissing(!!error);
    setErrors((data ?? []) as ErrorRow[]);
    setLoadedAt(Date.now());
    setDemo(await getDemoDataSummary());
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, ErrorGroup>();
    for (const e of errors ?? []) {
      const k = `${e.app}|${e.message}`;
      const g = m.get(k);
      if (g) { g.count += 1; if (e.route) g.routes.add(e.route); }
      else m.set(k, { message: e.message, app: e.app, count: 1, last: e, routes: new Set(e.route ? [e.route] : []) });
    }
    return [...m.values()].sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [errors]);

  const today = (errors ?? []).filter((e) => Date.parse(e.created_at) > loadedAt - 86_400_000).length;

  const clearAll = async () => {
    const { error } = await supabase.from('client_errors').delete().not('id', 'is', null).select('id');
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Crash reports cleared', 'success');
    setConfirmClear(false);
    await load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="System" subtitle="Is the database up to date, and has anything crashed?"
        actions={<SectionTabs tabs={SETTINGS_TABS} />} />

      <StatTiles items={[
        { label: 'Migrations waiting', value: pending == null ? '…' : pending.length, icon: Database, tone: pending?.length ? 'secondary' : undefined },
        { label: 'Crashes, last 24 h', value: errors == null ? '…' : today, icon: Bug, tone: today ? 'secondary' : undefined },
        { label: 'Different problems', value: errors == null ? '…' : groups.length, icon: AlertTriangle },
      ]} />

      <Section title="Database migrations" icon={Database}
        hint="Paste waiting ones one at a time in the Supabase SQL editor, in number order.">
        {pending == null ? (
          <div className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
        ) : pending.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-white">
            <CheckCircle2 size={16} style={{ color: 'var(--color-primary)' }} /> Everything up to {CHECKED[CHECKED.length - 1]} is live.
          </p>
        ) : (
          <div className="space-y-1.5">
            {pending.map((n) => (
              <div key={n} className="flex items-center gap-2 text-xs rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-raised)' }}>
                <AlertTriangle size={13} style={{ color: 'var(--color-secondary)' }} />
                <span className="text-white font-mono">{n}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>not pasted yet — supabase/migrations/{n}_*.sql</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Seeded rows, counted rather than left to inflate things quietly.

          `scripts/demo-data` puts 150 members, their payments, classes and
          attendance into this gym, and every figure on the dashboard counts
          them. Nothing here was lying — they are real counts of real rows — but
          an owner reading a year's revenue deserves to know which part of it
          was seeded for a demo.

          No button on purpose: removing it deletes rows in `profiles` and
          `auth.users`, which are not gym-scoped, so it is not a gym owner's to
          press. It is on the platform app (0117). */}
      {demo && demo.people > 0 && (
        <Section title="Demo data" icon={FlaskConical}
          hint="Seeded rows, counted in every figure on this dashboard.">
          <p className="text-sm text-white">
            {demo.people} seeded {demo.people === 1 ? 'person' : 'people'}
            {demo.coaches > 0 ? ` (${demo.coaches} of them coaches)` : ''}, with{' '}
            {demo.payments} payments, {demo.attendance} check-ins, {demo.classes} classes
            and {demo.bookings} bookings.
          </p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Your dashboard, revenue and retention all include these. Ask Core Fitness to clear
            them before you show the system to anyone — it cannot be undone, which is why it is
            deliberately not a button on this page.
          </p>
        </Section>
      )}

      <Section title="Crash reports" icon={Bug} count={errors?.length}
        hint="Filed automatically when a screen breaks in either app. Kept 60 days."
        actions={errors && errors.length > 0 ? <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>Clear all</Button> : undefined}>
        {errorsMissing ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Crash reports need migration 0095_operations.sql.
          </p>
        ) : errors == null ? (
          <div className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--color-surface-raised)' }} />
        ) : groups.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-white">
            <CheckCircle2 size={16} style={{ color: 'var(--color-primary)' }} /> No crashes reported.
          </p>
        ) : (
          <div className="space-y-1.5">
            {groups.map((g) => {
              const k = `${g.app}|${g.message}`;
              return (
                <div key={k} className="rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-raised)' }}>
                  <button className="w-full flex items-start justify-between gap-3 text-left" onClick={() => setOpen(open === k ? null : k)}>
                    <span className="min-w-0">
                      <span className="block text-xs text-white break-words">{g.message}</span>
                      <span className="block text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {g.app === 'member' ? 'Phone app' : 'Admin'} · {[...g.routes].slice(0, 3).join(', ') || 'unknown screen'}
                        {' · last '}{new Date(g.last.created_at).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </span>
                    <span className="text-[11px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--color-secondary)' }}>×{g.count}</span>
                  </button>
                  {open === k && (
                    <pre className="mt-2 text-[10px] whitespace-pre-wrap break-words max-h-48 overflow-y-auto p-2 rounded"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                      {`${g.last.stack ?? 'No stack'}\n\nBuild: ${g.last.build ?? '—'}\n${g.last.user_agent ?? ''}`}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Backups" icon={HardDriveDownload}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          The database is copied every Sunday at 2:00 AM (Manila) by the “Weekly database backup” workflow on
          GitHub, encrypted with your backup passphrase, and kept for 90 days. How to set it up, download one and
          restore it: <span className="font-mono">docs/BACKUPS.md</span>.
        </p>
      </Section>

      <ConfirmDialog isOpen={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={clearAll}
        title="Clear crash reports" message="Every crash report is removed. New ones will still be filed." />
    </div>
  );
}
