import { useNavigate } from 'react-router-dom';
import { Sparkle } from '@phosphor-icons/react';
import { useAssistantAllowed } from '../../hooks/useAssistantAllowed';
import { useAssistantPlacement } from '../../lib/assistantPlacement';
import { useT } from '../../lib/i18n';

/**
 * The assistant in the header (0213, the default): a violet sparkle beside the
 * bell on Today, Train and You. Nothing when the member chose the floating
 * bubble, or when the gym or their plan does not include the assistant.
 * Same size as the bell: 34px visible, 44px to a thumb.
 */
export default function AssistantButton() {
  const navigate = useNavigate();
  const allowed = useAssistantAllowed();
  const placement = useAssistantPlacement();
  const t = useT();
  if (!allowed || placement !== 'header') return null;
  return (
    <button onClick={() => navigate('/member/chatbot')} aria-label={t('Ask the assistant')} data-assistant-header
      className="relative grid place-items-center noc-press" style={{ width: 44, height: 44, margin: -5 }}>
      <span className="grid place-items-center" style={{
        width: 34, height: 34, borderRadius: 8,
        border: '1px solid color-mix(in srgb, var(--color-primary) 55%, transparent)',
        background: 'var(--color-primary-light)',
        color: 'var(--color-primary-300)',
      }}>
        <Sparkle size={17} weight="fill" />
      </span>
    </button>
  );
}
