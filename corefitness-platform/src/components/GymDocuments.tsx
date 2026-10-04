import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileSignature } from 'lucide-react';
import { explain, gymTerms, publishGymTerms, SITE, type GymTermsRow } from '../lib/platform';
import InfoDot from './InfoDot';

const day = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y!, (m ?? 1) - 1, d).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' }); };
const when = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' });

/**
 * The gym documents on the website (Terms for gyms, the DPA, the platform's
 * Privacy Policy) and whether they are in effect (0156).
 *
 * Putting a version in effect is what makes the website stop calling it a
 * draft, makes the apply form ask for agreement, and puts a banner in front of
 * every gym owner who has not agreed. The version is the date printed at the
 * top of the documents — the website's own source decides the words; this
 * decides which words bind. Below: every gym, and the version it agreed to.
 */
export default function GymDocuments() {
  const [rows, setRows] = useState<GymTermsRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [confirming, setConfirming] = useState<'publish' | 'withdraw' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await gymTerms()); setErr(null); }
    catch (e) { setRows([]); setErr(explain(e, '0156')); }
  }, []);
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const published = rows?.[0]?.published ?? null;
  const agreed = rows?.filter((r) => published && r.accepted_version === published).length ?? 0;

  const act = async (v: string | null) => {
    setBusy(true);
    try { await publishGymTerms(v); setConfirming(null); setVersion(''); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };

  return (
    <section className="card">
      <h2 className="section-title"><FileSignature size={14} /> Gym documents
        <InfoDot tip="Terms for gyms, the Data Processing Agreement and the Privacy Policy on the website. In effect only when you put a version in effect here (0156)." /></h2>
      {err && <p className="empty">{err}</p>}
      {rows && !err && (
        <>
          <p className="meta" style={{ marginTop: 0 }}>
            {published
              ? <>In effect: the version of <b>{day(published)}</b>. {agreed} of {rows.length} gym{rows.length === 1 ? '' : 's'} have agreed to it.</>
              : <>Drafts — nothing is in effect. The website says so, the apply form asks nobody to agree, and no owner is asked.</>}
            {' '}<a href={`${SITE}/#legal/terms`} target="_blank" rel="noopener noreferrer">Open the documents <ExternalLink size={11} /></a>
          </p>

          {confirming === null && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <label htmlFor="gd-version" style={{ margin: 0 }}>Version (the date at the top of the documents)</label>
              <input id="gd-version" type="date" value={version} onChange={(e) => setVersion(e.target.value)} style={{ width: 170 }} />
              <button className="btn" type="button" disabled={!version || busy || version === published} onClick={() => setConfirming('publish')}>Put in effect</button>
              {published && <button className="btn ghost" type="button" disabled={busy} onClick={() => setConfirming('withdraw')}>Set back to draft</button>}
            </div>
          )}
          {confirming === 'publish' && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <span>Put the version of <b>{day(version)}</b> in effect? Every gym's owner who has not agreed to it will be asked to, and new applicants must agree. Only do this once it has been reviewed.</span>
              <button className="btn" type="button" disabled={busy} onClick={() => void act(version)}>Put it in effect</button>
              <button className="btn ghost" type="button" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          )}
          {confirming === 'withdraw' && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <span>Set the documents back to draft? Owners stop being asked; agreements already given are kept.</span>
              <button className="btn" type="button" disabled={busy} onClick={() => void act(null)}>Set back to draft</button>
              <button className="btn ghost" type="button" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          )}

          {rows.length > 0 && (
            <table className="dd-table" style={{ marginTop: 14 }}>
              <thead><tr><th>Gym</th><th>Agreed to</th><th>By</th><th>When</th><th>When applying</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.gym_id}>
                    <td>{r.gym_name}</td>
                    <td>{r.accepted_version ? `${day(r.accepted_version)}${published && r.accepted_version !== published ? ' (older)' : ''}` : <span className="muted">not yet</span>}</td>
                    <td>{r.accepted_by ?? <span className="muted">—</span>}</td>
                    <td>{r.accepted_at ? when(r.accepted_at) : <span className="muted">—</span>}</td>
                    <td>{r.from_application ? day(r.from_application) : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
