// Shell for the 2026-11-27 mock-ups (History, Walk-ins, Notifications): the live app's rail and two-row header.
// <body data-tab="Attendance|Notifications">, a <div id="rail"></div> and <div id="top"></div>. ?mode=light flips the theme.
(() => {
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.mode = q.get('mode') === 'light' ? 'light' : 'dark';
  const p = (d) => `<svg class="i" viewBox="0 0 24 24"><path d="${d}"/></svg>`;
  const R = [['Desk', 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z'], ['People', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'],
    ['Coaching', 'M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M2 11v2M22 11v2'], ['Money', 'M2 6h20v12H2zM2 10h20'], ['Reports', 'M3 3v18h18M7 15l4-4 3 3 5-6'],
    ['Engage', 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z'], ['Messages', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    ['Library', 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zM4 19.5V22h16']];
  document.getElementById('rail').outerHTML = `<nav class="sb-rail"><span class="logo">CF</span>${R.map(([n, d], i) => `<a class="${i === 0 ? 'on' : ''}">${p(d)}${n}</a>`).join('')}
    <a class="push">${p('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2-1-2-4-2 .5-1.5-1.2L15 4h-6l-.5 2.3L7 7.5 5 7l-2 4 2 1-2 1 2 4 2-.5 1.5 1.2L9 20h6l.5-2.3 1.5-1.2 2 .5 2-4z')}Gym</a>
    <a>${p('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01')}Help</a><span class="av me">LL</span></nav>`;
  const tab = document.body.dataset.tab;
  document.getElementById('top').outerHTML = `<div class="sb-top"><div class="row1"><span class="gymname">Core Fitness Lab <small>Where Core Fitness is tried first</small></span>
    <div class="cmd">${p('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3')}Search anything<span class="kbd">Ctrl K</span></div>
    <button class="ico-btn">${p('M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4').replace('class="i"', 'class="i" width="18" height="18"')}<span class="n">9</span></button></div>
    <div class="row2"><span class="sec">Desk</span>${['Today', 'Attendance', 'Notifications'].map((t) => `<a class="${t === tab ? 'on' : ''}">${t}</a>`).join('')}</div></div>`;
  window.ICON = p;
})();
