/** Resolve the active member's identifier (email is used as the key in this prototype). */
export function useMemberId(): string {
  return localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com';
}
