/** Line icons drawn inline, so the page needs no icon library. Stroke follows `currentColor`. */
const PATHS = {
  desk: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M8 2.5v4M16 2.5v4M3 10h18M8 14h2M14 14h2M8 17.5h2" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M10.5 18.5h3" /></>,
  star: <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.8l-5.3 2.9 1.1-6-4.4-4.2 6-.8z" />,
  brush: <><path d="M14.5 4.5l5 5-8.2 8.2a3.5 3.5 0 0 1-5 0 3.5 3.5 0 0 1 0-5z" /><path d="M6.3 17.7L3 21" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" /><path d="M8.8 12l2.2 2.2 4.2-4.4" /></>,
  check: <path d="M4.5 12.5l4.8 4.8L19.5 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  qr: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><path d="M14 14h2.5v2.5H14zM20.5 14v.01M14 20.5h.01M18 18h2.5v2.5H18z" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.01M18 14.5v.01" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
