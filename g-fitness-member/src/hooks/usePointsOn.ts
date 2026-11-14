import { useGymApp } from './useGymApp';
import { moduleOn } from '../lib/gymApp';

/** Whether this gym runs points (its Points switch, 0186). Off: nothing may promise or show points it pays. */
export function usePointsOn(): boolean {
  return moduleOn(useGymApp(), 'points');
}
