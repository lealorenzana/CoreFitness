/**
 * The colour behind the glass (the owner, 2026-11-07): four soft blobs of the gym's own two colours,
 * blurred and drifting slowly (index.css → .cf-ambient). Decoration only — hidden from screen readers,
 * never takes a tap, and still for anyone whose phone asks for less motion.
 */
export default function Ambient() {
  return (
    <div className="cf-ambient" aria-hidden data-ambient>
      <div className="cf-ambient__wash">
        <span className="a" /><span className="b" /><span className="c" /><span className="d" />
      </div>
    </div>
  );
}
