import { Smartphone } from 'lucide-react';

function getMemberAppUrl(): string {
  const envUrl = import.meta.env.VITE_MEMBER_URL as string | undefined;
  if (envUrl) return envUrl;
  const { protocol, hostname, port } = window.location;
  if (port === '5174') return `${protocol}//${hostname}:5173/`;
  return `${protocol}//${hostname}:5173/`;
}

/** Quick link to the member app — bottom-left so it doesn't collide with the chatbot. */
export default function MemberPortalButton() {
  const surfaceRaised = 'var(--color-surface-raised)';
  const border = 'var(--color-border)';
  const muted = 'var(--color-text-secondary)';
  const violet = 'var(--color-primary)';

  return (
    <a
      href={getMemberAppUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 left-6 z-40 flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold transition-colors"
      style={{ background: surfaceRaised, border: `1px solid ${border}`, color: muted }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = violet;
        e.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = border;
        e.currentTarget.style.color = muted;
      }}
    >
      <Smartphone size={16} style={{ color: violet }} />
      Member App
    </a>
  );
}
