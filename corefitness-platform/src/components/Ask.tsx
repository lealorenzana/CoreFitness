import { useState } from 'react';

export interface AskField {
  key: string;
  label: string;
  /** A short list makes a <select>; leaving it out makes an <input>. */
  options?: string[];
  type?: 'text' | 'date';
  placeholder?: string;
  initial?: string;
  /** Blank is refused before the call is made — 0106 refuses it again in SQL. */
  required?: boolean;
}

interface Props {
  title: string;
  blurb?: string;
  fields: AskField[];
  confirmLabel: string;
  onConfirm: (values: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}

/**
 * A question this app has to ask before doing something consequential —
 * suspending a gym, changing its plan, turning an application down.
 *
 * These used to be `window.prompt()`. That works in a normal browser and does
 * nothing at all in an embedded one — it throws "prompt() is not supported",
 * so the button looked dead and the decision was silently lost. A form on the
 * page works everywhere, and it can show what it is about to do.
 */
export default function Ask({ title, blurb, fields, confirmLabel, onConfirm, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, f.initial ?? (f.options ? f.options[0] : '')]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = fields.find((f) => f.required && !values[f.key]?.trim());
    if (missing) { setError(`${missing.label} is needed.`); return; }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
      setBusy(false);
    }
  };

  return (
    <form className="card ask" onSubmit={submit}>
      <div className="name">{title}</div>
      {blurb && <div className="meta">{blurb}</div>}
      <div className="fields">
        {fields.map((field) => (
          <div key={field.key} style={field.options ? undefined : { gridColumn: '1 / -1' }}>
            <label htmlFor={`ask-${field.key}`}>{field.label}</label>
            {field.options ? (
              <select id={`ask-${field.key}`} value={values[field.key]}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}>
                {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input id={`ask-${field.key}`} type={field.type ?? 'text'} value={values[field.key]}
                placeholder={field.placeholder} autoFocus={field === fields[0]}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
      {error && <p className="err">{error}</p>}
      <div style={{ height: 12 }} />
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
