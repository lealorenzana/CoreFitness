import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * The Progress section became You → Progress (simplify, 2026-10-28). Every old
 * link lands where its part lives now: `?tab=body` on Body, `?tab=goals` on
 * Targets, `?tab=feedback` on the coach's notes, anything else on the tab.
 */
export default function ProgressHub() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  const to = tab === 'body' ? '/member/body'
    : tab === 'goals' ? '/member/targets'
    : tab === 'feedback' ? '/member/coach-notes'
    : tab === 'badges' ? '/member/membership?tab=badges'
    : '/member/membership?tab=progress';
  return <Navigate to={to} replace />;
}
