/**
 * The colour behind the glass (the owner, 2026-11-07, "like the mockup"): soft blobs of the gym's own two
 * colours, blurred and drifting slowly (light.css → .cf-ambient), quiet in dark. Decoration only — hidden
 * from screen readers, never takes a click, still for anyone who asks for less motion.
 */
export default function Ambient() {
  return (
    <div className="cf-ambient" aria-hidden data-ambient>
      <div className="cf-ambient__wash"><span className="a" /><span className="b" /><span className="c" /></div>
    </div>
  );
}
