import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineRow, SectionHead } from '../ui/noc';
import { dueLabel, myDueClasswork, type DueItem } from '../../lib/api/rooms';

/**
 * Today's "Due this week" (0129): the member's open classwork across every room,
 * due within seven days. Renders nothing when there is none — an empty strip is
 * noise on the first screen. Loading it also runs the due-tomorrow reminder
 * sweep, the way the other reminders run on page load.
 */
export default function DueStrip() {
  const navigate = useNavigate();
  const [items, setItems] = useState<DueItem[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => { const d = await myDueClasswork(); if (alive) setItems(d); })();
    return () => { alive = false; };
  }, []);
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHead title="Due this week" meta={`${items.length}`} />
      {items.slice(0, 3).map((d, i) => (
        <LineRow key={d.assignmentId} title={d.title} last={i === Math.min(items.length, 3) - 1}
          meta={`${d.roomName} · due ${dueLabel(d.dueOn)}`}
          onClick={() => navigate(`/member/rooms/${d.roomId}?tab=classwork`)} />
      ))}
      {items.length > 3 && (
        <LineRow title={`${items.length - 3} more`} meta="All your rooms" onClick={() => navigate('/member/rooms')} last />
      )}
    </section>
  );
}
