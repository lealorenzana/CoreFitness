import { useEffect, useState } from 'react';
import { getDoorSettings, setDoorSettings, type DoorSettings as Door } from '../lib/api/door';
import { showToast } from '../utils/toast';

/**
 * How check-in works (0200): whether members pick their activity on their QR
 * screen, and whether coaches check in too (each gets a QR in the trainer
 * app; the desk and the kiosk take it). Each switch saves at once through
 * set_door_settings(). Shared by the setup wizard and Settings → Gym
 * Information. Renders nothing before 0200.
 */
export default function DoorSettings() {
  const [door, setDoor] = useState<Door | null>(null);
  useEffect(() => { void (async () => setDoor(await getDoorSettings()))(); }, []);
  if (!door) return null;

  const flip = async (key: keyof Door) => {
    const next = { ...door, [key]: !door[key] };
    setDoor(next);
    try {
      await setDoorSettings(key === 'memberPick' ? next.memberPick : null, key === 'coachCheckin' ? next.coachCheckin : null);
      showToast(key === 'coachCheckin'
        ? (next.coachCheckin ? 'Coaches check in too — each has a QR in their app' : 'Coach check-in is off')
        : (next.memberPick ? 'Members pick their activity when they check in' : 'Only the desk tags check-ins'), 'success');
    } catch (err) {
      setDoor(door);
      showToast(err instanceof Error ? err.message : 'Could not save that', 'error');
    }
  };
  const muted = { color: 'var(--color-text-secondary)' };
  const row = (key: keyof Door, title: string, body: string) => (
    <label className="flex items-start gap-3 cursor-pointer" data-door-switch={key}>
      <input type="checkbox" role="switch" checked={door[key]} onChange={() => void flip(key)} className="mt-1" aria-label={title} />
      <span>
        <span className="block text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
        <span className="block text-xs mt-0.5" style={muted}>{body}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-4" data-door-settings>
      {row('coachCheckin', 'Coaches check in too',
        'Each coach gets a QR in their app. The desk or the kiosk scans it, and you see who came in and when on Attendance → Today. A coach is never counted as a member visit — no points, streaks or member totals.')}
      {row('memberPick', 'Members pick their activity',
        'Members tap what they are doing today on their QR screen (from your check-in activities) and can make it their usual. The desk’s own tag still wins.')}
    </div>
  );
}
