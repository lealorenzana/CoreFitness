/**
 * A small "?" beside a heading that needs a sentence of context but has no
 * control to hang it on. A button, so it is reachable by keyboard; its text is
 * a `data-tip`, which TooltipLayer draws.
 *
 * Its accessible *name* is a short constant and the sentence is its
 * *description*: named after its own text, a dot whose sentence mentioned
 * "replying" answered to "Reply" and shadowed the real reply box.
 */
export default function InfoDot({ tip }: { tip: string }) {
  return <button type="button" className="info-dot" data-tip={tip} aria-label="More about this" aria-description={tip}>?</button>;
}
