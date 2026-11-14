import { moduleOn, useGymModules } from './useGymModules';

/** Whether this gym runs points (its Points switch, 0186). Off: the database pays none (0253). */
export function usePointsOn(): boolean {
  return moduleOn(useGymModules(), 'points');
}
