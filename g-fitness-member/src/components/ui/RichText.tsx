/**
 * The two marks our assistant answers actually use: `**bold**` and `• bullet`.
 *
 * Both chat surfaces printed the asterisks literally — every canned answer opens
 * with a `**Heading:**`, so every answer led with visible stars. This is not a
 * markdown parser and shouldn't become one: the input is a table of strings in
 * this repo, not user content, so it only needs to handle what that table
 * contains. A real parser would be a dependency and an XSS surface for no gain.
 */
export default function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, li) => {
        if (line.trim() === '') return <span key={li} className="block h-2" />;

        const bullet = line.trimStart().startsWith('•');
        const body = bullet ? line.trimStart().slice(1).trim() : line;

        const parts = body.split(/\*\*(.+?)\*\*/g).map((seg, si) =>
          si % 2 === 1 ? (
            <strong key={si} className="font-bold text-white">{seg}</strong>
          ) : (
            <span key={si}>{seg}</span>
          )
        );

        return bullet ? (
          <span key={li} className="flex gap-1.5">
            <span style={{ color: 'var(--color-primary)' }}>•</span>
            <span className="flex-1">{parts}</span>
          </span>
        ) : (
          <span key={li} className="block">{parts}</span>
        );
      })}
    </>
  );
}
