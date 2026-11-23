/**
 * Grey shapes while something loads, instead of the word "Loading…"; the words stay for screen readers.
 * Shaped like what is coming (owner, 2026-11-23: "there are two boxes but the loader is just lines"):
 *   rows        list rows, a circle and two lines, for inside a box (the default)
 *   split       a page: header, a list box beside a big panel (Rooms, Programs, Help)
 *   figs-split  a page: header, four figure tiles, a list beside a side panel (Equipment, Coaching)
 *   table       a page: header, four figure tiles, one box of table rows (Payments, Rewards)
 *   main-side   a page: header, a main box beside a side panel on the right (Exercises)
 *   cards       a page: header, a grid of cards (Shop, Your plan)
 *   settings    a page: header, a section list beside one column of rows (Your app, Plans)
 * Byte-identical in admin, member and platform; the styles are `.cf-sk*` in each app's stylesheet.
 */
export type SkelShape = 'rows' | 'split' | 'main-side' | 'figs-split' | 'table' | 'cards' | 'settings';

const TITLE = [62, 48, 70, 55, 40];
const SUB = [38, 30, 44, 26, 34];

function Rows({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="cf-skr">
          <i className="cf-skel cf-skc" />
          <span><i className="cf-skel" style={{ width: `${TITLE[i % 5]}%` }} /><i className="cf-skel cf-sks" style={{ width: `${SUB[i % 5]}%` }} /></span>
        </span>
      ))}
    </>
  );
}

const Head = () => <div className="cf-skh"><i className="cf-skel" /><i className="cf-skel cf-sks" /></div>;
const Figs = () => (
  <div className="cf-skfigs">
    {[0, 1, 2, 3].map((i) => <div key={i} className="cf-skbox"><i className="cf-skel cf-sks" style={{ width: '50%' }} /><i className="cf-skel cf-sknum" /></div>)}
  </div>
);
const Panel = () => (
  <div className="cf-skbox">
    <i className="cf-skel" style={{ width: '40%' }} /><i className="cf-skel cf-sks" style={{ width: '70%' }} />
    <i className="cf-skel cf-skblock" /><i className="cf-skel cf-skblock" /><i className="cf-skel cf-skblock" />
  </div>
);

export default function SkelRows({ label = 'Loading', rows = 3, shape = 'rows' }: { label?: string; rows?: number; shape?: SkelShape }) {
  let body;
  if (shape === 'split') body = <><Head /><div className="cf-skgrid"><div className="cf-skbox"><Rows n={8} /></div><Panel /></div></>;
  else if (shape === 'main-side') body = <><Head /><div className="cf-skgrid"><div className="cf-skbox"><Rows n={8} /></div><Panel /></div></>;
  else if (shape === 'figs-split') body = <><Head /><Figs /><div className="cf-skgrid"><div className="cf-skbox"><Rows n={7} /></div><Panel /></div></>;
  else if (shape === 'table') body = <><Head /><Figs /><div className="cf-skbox"><i className="cf-skel cf-sktool" /><Rows n={8} /></div></>;
  else if (shape === 'cards') body = <><Head /><div className="cf-skcards">{Array.from({ length: 6 }, (_, i) => <div key={i} className="cf-skbox"><i className="cf-skel cf-skblock" /><i className="cf-skel" style={{ width: '60%' }} /><i className="cf-skel cf-sks" style={{ width: '40%' }} /></div>)}</div></>;
  else if (shape === 'settings') body = <><Head /><div className="cf-skgrid"><div className="cf-sknav"><Rows n={7} /></div><div className="cf-skcol"><Rows n={9} /></div></div></>;
  else body = <Rows n={rows} />;
  return <div className={`cf-skel-rows cf-sk-${shape}`} role="status" aria-label={label}>{body}</div>;
}
