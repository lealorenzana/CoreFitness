import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { equipmentForExercise, STATUS_WORDS, type EquipmentStatus } from '../../lib/api/equipment';
import { useGymApp } from '../../hooks/useGymApp';
import { moduleOn } from '../../lib/gymApp';

/**
 * "At your gym: Leg press · 2nd floor" under an exercise (0184) — the items
 * the owner linked to it, where they are, and whether one is under repair.
 * Nothing at a gym with the equipment switch off or nothing linked.
 */
export default function AtYourGym({ exerciseId }: { exerciseId: string }) {
  const navigate = useNavigate();
  const app = useGymApp();
  const [items, setItems] = useState<{ id: string; name: string; locationNote: string | null; status: EquipmentStatus }[]>([]);
  const on = moduleOn(app, 'equipment');
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void equipmentForExercise(exerciseId).then((r) => { if (alive) setItems(r); });
    return () => { alive = false; };
  }, [exerciseId, on]);
  if (!on || items.length === 0) return null;
  return (
    <div data-at-your-gym>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary-300)' }}>At your gym</p>
      {items.map((i) => (
        <button key={i.id} type="button" onClick={() => navigate('/member/equipment')} className="block text-left"
          style={{ fontSize: 14, marginTop: 4, color: 'var(--color-text-primary)' }}>
          {i.name}{i.locationNote ? ` · ${i.locationNote}` : ''}
          {i.status !== 'available' && <span style={{ color: 'var(--color-secondary)' }}> · {STATUS_WORDS[i.status]}</span>}
        </button>
      ))}
    </div>
  );
}
