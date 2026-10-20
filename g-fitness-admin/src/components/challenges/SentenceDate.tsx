import DatePicker from '../ui/DatePicker';

const word = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : 'pick a day');

/**
 * A date inside a sentence builder (2026-10-20): reads as the dashed word the
 * mock-up shows and opens the shared DatePicker's calendar in one tap — so the
 * picker's mode and bounds still apply, never a bare native date input.
 */
export default function SentenceDate({ value, onChange, min, label }: { value: string; onChange: (v: string) => void; min?: string; label: string }) {
  return <DatePicker mode="future" min={min} value={value} onChange={onChange} triggerClassName="a-word" triggerLabel={word(value)} triggerAriaLabel={label} />;
}
