import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TextTabs } from '../ui/noc';
import { useGymApp } from '../../hooks/useGymApp';
import { useT } from '../../lib/i18n';
import { HUBS, hubAt, hubTabs, rememberHubTab } from './memberNav';

/**
 * The tab strip of the section this screen belongs to (memberNav HUBS), drawn
 * by `PageTitle` under the title — so every screen of a section carries it,
 * including its loading state, and a screen opened *from* a section (one
 * program, one room, one conversation) does not.
 *
 * A tap replaces the entry: Back leaves the section instead of retracing tabs.
 * The tab is remembered for the session, so the rail's pill returns to it.
 */
export default function HubStrip() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const app = useGymApp();
  const t = useT();
  const at = pathname.startsWith('/member/') ? hubAt(pathname, search) : null;

  useEffect(() => {
    if (at) rememberHubTab(at.hub, pathname + search);
  }, [at, pathname, search]);

  if (!at) return null;
  const tabs = hubTabs(at.hub, app);
  if (tabs.length < 2) return null;
  const label = HUBS.find((h) => h.id === at.hub)?.label ?? '';
  return (
    <div data-hub={at.hub} style={{ marginTop: 14 }}>
      <TextTabs<string>
        label={t(label)}
        tabs={tabs.map((d) => ({ id: d.path, label: t(d.label) }))}
        active={at.tab.path}
        onChange={(path) => navigate(path, { replace: true })}
        gap={20}
      />
    </div>
  );
}
