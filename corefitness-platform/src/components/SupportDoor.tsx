import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { listSupportGrants } from '../lib/platform';

/** "Look inside" on a gym's profile while — and only while — that gym has granted support access. */
export default function SupportDoor({ gymId }: { gymId: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void listSupportGrants().then((g) => { if (alive) setOpen(g.some((x) => x.gym_id === gymId)); }, () => undefined);
    return () => { alive = false; };
  }, [gymId]);
  if (!open) return null;
  return <Link className="btn" to={`/support-access/${gymId}`} data-tip="This gym granted support access: look, read-only"><Eye size={14} /> Look inside</Link>;
}
