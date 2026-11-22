import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, LogOut, Moon, Settings as SettingsIcon, Sun, MonitorSmartphone } from 'lucide-react';
import Avatar from '../ui/Avatar';
import { toast } from '../ui/sonner';
import { supabase } from '../../lib/supabaseClient';
import { getMyProfile, MY_PROFILE_CHANGED } from '../../lib/api/profiles';
import { getGymContext } from '../../lib/gymContext';
import { onColorMode, resolvedMode, setColorMode } from '../../lib/colorMode';

/**
 * Your account, at the foot of the sidebar (Design V2, owner 2026-11-22): name and role, and a menu with
 * Light or dark, Settings, Log out on this device and Log out on all devices. It replaced the header's
 * name chip and sun/moon and the sidebar's Logout row. `compact` is the collapsed rail: the photo only.
 *
 * The name is the signed-in person's own (never a placeholder, the no-fallback-identity rule); the role is
 * the role at THIS gym (gym_roles via my_gym_context), not the legacy profiles.role.
 */
export default function AccountMenu({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [mode, setMode] = useState(resolvedMode());
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => onColorMode(() => setMode(resolvedMode())), []);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const p = await getMyProfile().catch(() => null);
      if (!alive || !p) return;
      setName(`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null);
      setPhoto(p.photo_url ?? null);
    };
    void load();
    void getGymContext().then((c) => { if (alive) setRole(c?.role ?? null); });
    window.addEventListener(MY_PROFILE_CHANGED, load);
    return () => { alive = false; window.removeEventListener(MY_PROFILE_CHANGED, load); };
  }, []);

  // Close on a click outside or Escape; focus the first item when it opens.
  useEffect(() => {
    if (!at) return;
    const onDown = (e: MouseEvent) => {
      if (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return;
      setAt(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAt(null); btn.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [at]);

  const toggle = () => {
    if (at) { setAt(null); return; }
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ left: r.left, bottom: window.innerHeight - r.top + 6 });
  };

  const logout = async (scope: 'local' | 'global') => {
    setAt(null);
    // 'local' ends this device only; 'global' ends every session this account has (the member app's
    // Settings offers the same pair). The account-change listener clears the per-account caches.
    await supabase.auth.signOut({ scope });
    toast.success(scope === 'global' ? 'Logged out on all devices' : 'Logged out');
    navigate('/admin/login');
  };

  const roleWord = role === 'admin' ? 'Owner' : role === 'staff' ? 'Front desk' : role ? role[0].toUpperCase() + role.slice(1) : '';
  const next = mode === 'light' ? 'dark' : 'light';

  return (
    <>
      <button ref={btn} type="button" onClick={toggle} className={`acc-btn${compact ? ' compact' : ''}`}
        aria-haspopup="menu" aria-expanded={!!at} aria-label="Your account" data-account-menu>
        <Avatar key={photo ?? "none"} name={name} photoUrl={photo} size={28} zoom={false} className="text-[11px] font-semibold" />
        {!compact && (
          <>
            <span className="acc-who">
              {name && <b>{name}</b>}
              {roleWord && <small>{roleWord}</small>}
            </span>
            <ChevronsUpDown size={14} className="acc-chev" />
          </>
        )}
      </button>
      {at && createPortal(
        <div ref={menu} role="menu" aria-label="Your account" className="acc-menu" style={{ left: at.left, bottom: at.bottom }}>
          {name && (
            <div className="acc-head">
              <b>{name}</b>
              {roleWord && <small>{roleWord}</small>}
            </div>
          )}
          <button role="menuitem" data-mode-toggle onClick={() => { void setColorMode(next); }}>
            {next === 'light' ? <Sun size={15} /> : <Moon size={15} />}
            {next === 'light' ? 'Light mode' : 'Dark mode'}
            <span className="acc-note">saved on your account</span>
          </button>
          {role === 'admin' && (
            <button role="menuitem" onClick={() => { setAt(null); navigate('/settings'); }}>
              <SettingsIcon size={15} /> Settings
            </button>
          )}
          <div className="acc-sep" />
          <button role="menuitem" onClick={() => void logout('local')}>
            <LogOut size={15} /> Log out on this device
          </button>
          <button role="menuitem" onClick={() => void logout('global')}>
            <MonitorSmartphone size={15} /> Log out on all devices
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
