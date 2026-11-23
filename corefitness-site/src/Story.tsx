import Icon, { type IconName } from './Icon';
import { useState } from 'react';
import MockupDemoMedia, { type DemoName } from './MockupDemoMedia';

/**
 * "One day at your gym" — the scrollytelling section.
 *
 * The section is five screens tall; its stage is sticky, and the chapter you
 * are in decides which scene the device shows and whether it is the member's
 * phone or the front desk. Each scene uses an actual captured interface with demo records,
 * and says so — but every behaviour in it is one the system has (copy is a
 * claim): QR check-in and the kiosk, receipt numbers the database issues,
 * the waitlist telling everyone a seat freed, personal records found by a trigger,
 * the cash day summary and the retention list.
 */

interface Chapter {
  time: string;
  /** Minutes since midnight, for the clock hand. */
  at: number;
  who: string;
  device: 'phone-d' | 'desk';
  icon: IconName;
  title: string;
  body: string;
}

const CHAPTERS: Chapter[] = [
  {
    time: '6:00 AM', at: 360, who: "A member's phone", device: 'phone-d', icon: 'qr',
    title: 'Doors open. Members check themselves in.',
    body: 'Every member carries a check-in code in their app. The desk scans it, or the kiosk by the door does, and the front desk keeps working.',
  },
  {
    time: '9:30 AM', at: 570, who: 'The front desk', device: 'desk', icon: 'receipt',
    title: 'Cash, counted properly.',
    body: 'A payment at the desk gets a receipt number the database issues. It is never typed and never repeated, and the day’s cash adds up when the drawer closes.',
  },
  {
    time: '12:00 PM', at: 720, who: "A coach's phone", device: 'phone-d', icon: 'calendar',
    title: 'Coaches decide their own bookings.',
    body: 'A member asks for a time inside the coach’s own hours. The coach accepts or declines with a reason, clashes are checked on both sides, and the member hears at once.',
  },
  {
    time: '5:30 PM', at: 1050, who: "A member's phone", device: 'phone-d', icon: 'dumbbell',
    title: 'Training that counts.',
    body: 'Members log their sets. The database spots a personal record, and points and badges follow the rules you set. Nothing a phone can fake.',
  },
  {
    time: '9:00 PM', at: 1260, who: "The owner's dashboard", device: 'desk', icon: 'chart',
    title: 'Close the day knowing it.',
    body: 'Check-ins by the hour, the day’s cash, who is drifting away, and whose membership ends this week, before you lock up.',
  },
];

const CHAPTER_MEDIA: DemoName[] = ['checkin','payments','coach','workout','overview'];

const fmtClock = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`;
};

/** Stable, ordinary-flow panel. Chapters change by button, never by scrolling the page. */
export default function Story() {
  const [chapter, setChapter] = useState(0);
  const c = CHAPTERS[chapter];
  return <section className="story v2-story v3-video-section" id="day">
    <div className="story-stage">
      <div className="v2-story-panel">
        <img className="v2-story-dumbbells" src="/mockup-art/floating-dumbbells.webp" alt="" aria-hidden="true" />
        <div className="story-copy">
          <p className="story-head">One day at your gym</p>
          <div className="story-time"><b className="num">{fmtClock(c.at)}</b><span>{c.at<720?'AM':'PM'}</span></div>
          <article className="v3-day-copy" key={chapter}>
            <span className="who"><Icon name={c.icon} />{c.who}</span>
            <h2>{c.title}</h2><p>{c.body}</p>
          </article>
          <ol className="story-steps" aria-label="Choose a time of day">{CHAPTERS.map((ch,i)=><li key={ch.time} className={i===chapter?'on':''}><button type="button" aria-current={i===chapter?'step':undefined} onClick={()=>setChapter(i)}><i aria-hidden="true"/><span>{ch.time}</span></button></li>)}</ol>
        </div>
        <div className="story-visual"><MockupDemoMedia name={CHAPTER_MEDIA[chapter]} label={c.who + ' demo'} /></div>
      </div>
    </div>
  </section>;
}
