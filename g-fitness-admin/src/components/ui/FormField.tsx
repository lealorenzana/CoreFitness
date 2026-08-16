/**
 * The one labelled form field for admin modals.
 *
 * Three pages had grown their own: Events had none at all (bare inputs with
 * placeholder-only hints, so a filled-in form read as five identical boxes
 * ending in "30" and "60" with nothing saying which was capacity and which was
 * minutes), Members had a private `Field`, Trainers repeated the same label
 * markup fourteen times inline.
 *
 * A placeholder is not a label. It disappears exactly when the form is at its
 * most confusing — once every box has something in it.
 */

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-secondary)' }}>
      {children}
    </p>
  );
}

/** A hairline between field groups. Paired with SectionLabel. */
export function FieldDivider() {
  return <div className="pt-1" style={{ borderTop: '1px solid var(--color-border)' }} />;
}

export default function FormField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  /** Explains the field when the label can't. Hidden while an error shows. */
  hint?: string | null;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] block mb-1.5 font-medium uppercase tracking-wider"
        style={{ color: 'var(--color-text-muted)' }}>
        {label}
        {required && <span style={{ color: 'var(--color-secondary)' }}> *</span>}
      </label>
      {children}
      {/* An error replaces the hint rather than stacking under it — two lines of
          small grey-and-amber text below one input is unreadable at 10px. */}
      {error
        ? <p className="text-[10px] mt-1" style={{ color: 'var(--color-secondary)' }}>{error}</p>
        : hint
          ? <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>
          : null}
    </div>
  );
}
