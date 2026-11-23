// The motion grammar every video shares (from the owner's reference): dim, pop, tap, stack, resolve.
// kit(tl) returns helpers bound to one paused timeline; everything is a function of timeline time.
window.kit = (tl) => {
  const $ = (id) => document.getElementById(id);
  const centre = (id, fx = 0.5, fy = 0.55) => { const b = $(id).getBoundingClientRect(); return { x: b.left + b.width * fx - 4, y: b.top + b.height * fy - 4 }; };
  const pop = (sel, at) => tl.fromTo(sel, { scale: 0.6, opacity: 0, transformOrigin: '50% 60%' }, { scale: 1, opacity: 1, duration: 0.42, ease: 'back.out(1.7)' }, at);
  const stack = (sels, at, gap = 0.22) => tl.fromTo(sels, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.32, stagger: gap, ease: 'back.out(1.4)' }, at);
  const dim = (on, off) => { tl.fromTo('#dim i', { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' }, on); tl.to('#dim i', { opacity: 0, duration: 0.45, ease: 'power2.inOut' }, off); };
  const cursorIn = (x, y, at) => tl.fromTo('#cursor', { x, y, opacity: 0 }, { x, y, opacity: 1, duration: 0.01 }, at);
  const glide = (p, at, d = 0.6) => tl.to('#cursor', { x: p.x, y: p.y, duration: d, ease: 'power2.inOut' }, at);
  // Glide onto a control, press it (cursor and control dip), and spread the ripple inside it if it has one.
  const tap = (id, at, ripple) => {
    const p = centre(id);
    glide(p, at - 0.65);
    tl.to('#cursor', { scale: 0.86, duration: 0.08, yoyo: true, repeat: 1 }, at);
    tl.to('#' + id, { scale: 0.94, duration: 0.08, yoyo: true, repeat: 1 }, at);
    if (ripple) tl.fromTo('#' + ripple, { scale: 0, opacity: 0.6 }, { scale: 6, opacity: 0, duration: 0.45, ease: 'power2.out' }, at + 0.02);
    if (ripple) tl.to('#' + ripple, { scale: 0, duration: 0.01 }, at + 0.5); // a faded ripple left scaled up reads as overflow
    return p;
  };
  // A two-state switch at one moment that stays right when the timeline is seeked either way.
  const flip = (at, apply) => { const f = { v: 0 }; tl.to(f, { v: 1, duration: 0.02, onUpdate() { apply(f.v > 0.5); } }, at); };
  const count = (id, from, to, at, d = 1.3, fmt = (n) => Math.round(n).toLocaleString('en-US')) => {
    const c = { v: from };
    tl.fromTo(c, { v: from }, { v: to, duration: d, ease: 'power2.out', onUpdate() { $(id).textContent = fmt(c.v); } }, at);
  };
  const away = (sel, at, y = -30) => tl.to(sel, { scale: 0.8, opacity: 0, y, duration: 0.3, stagger: 0.05, ease: 'power2.in' }, at);
  return { $, centre, pop, stack, dim, cursorIn, glide, tap, flip, count, away };
};
