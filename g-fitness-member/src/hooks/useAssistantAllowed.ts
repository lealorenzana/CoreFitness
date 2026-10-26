import { useFeatures } from './useFeatures';
import { useGymApp } from './useGymApp';
import { isEnabled } from '../lib/api/planFeatures';
import { moduleOn } from '../lib/gymApp';

/**
 * Whether this member gets the assistant button at all — header or floating,
 * the same rule for both (0049/0059, 0110).
 *
 * The gym's own switch first: a gym that turned the assistant off must not have
 * it on every screen, whatever a member's plan says. A failed plan check falls
 * through to *showing* it — a lock that appears because the network dropped is
 * the same lie as an empty list reading "nothing here"; the route itself still
 * locks and explains for a plan without it.
 */
export function useAssistantAllowed(): boolean {
  const { features, loading, error } = useFeatures();
  const app = useGymApp();
  if (!moduleOn(app, 'assistant')) return false;
  if (error) return true;
  return !loading && isEnabled(features, 'ai_model');
}
