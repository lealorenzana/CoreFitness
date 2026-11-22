// Shared sidebar + top bar for the Design V2 mock-ups. ?mode=light flips the theme.
(() => {
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.mode = q.get('mode') === 'light' ? 'light' : 'dark';
  const ic = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
  const I = {
    home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z', bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4',
    check: 'M4 12l5 5L20 6', people: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
    pt: 'M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12', cal: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4', card: 'M3 6h18v12H3zM3 10h18',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12', book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6', phone: 'M7 2h10v20H7zM11 18h2',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2-1-2-4-2 .5-1.5-1.2L15 4h-6l-.5 2.3L7 7.5 5 7l-2 4 2 1-2 1 2 4 2-.5 1.5 1.2L9 20h6l.5-2.3 1.5-1.2 2 .5 2-4z',
  };
  const items = [['Dashboard', 'home'], ['Notifications', 'bell'], ['Attendance', 'check'], ['People', 'people', '›'], ['Personal training', 'pt'],
    ['Classes', 'cal', '›'], ['Billing', 'card', '›'], ['Reports', 'chart', '›'], ['Engagement', 'star', '›'], 'sep', ['Communications', 'bell'],
    ['Gym chat', 'chat'], ['Training', 'book', '›'], 'sep', ['Your app', 'phone'], ['Settings', 'gear'], ['Your plan', 'card'], ['Help', 'book']];
  const on = document.body.dataset.page;
  document.getElementById('side').innerHTML = `
    <div class="gym"><span class="logo">CF</span><span><b>Core Fitness Lab</b><small>Owner</small></span></div>
    <nav class="nav">${items.map((it) => it === 'sep' ? '<div class="sep"></div>'
      : `<a class="${it[0] === on ? 'on' : ''}">${ic(I[it[1]])}${it[0]}${it[2] ? `<span class="more">${it[2]}</span>` : ''}</a>`).join('')}</nav>
    <div class="me"><span class="av">LL</span><span><b style="font-size:13px">Lea Lorenzana</b><br><small style="color:var(--text-3);font-size:12px">Owner</small></span></div>`;
  document.getElementById('top').innerHTML = `
    <b style="font-size:13px">Core Fitness Lab</b>
    <div class="search">${ic('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3').replace('<svg', '<svg width="14" height="14" stroke="currentColor" fill="none" stroke-width="1.75"')}Search members, payments, pages<span class="kbd">Ctrl K</span></div>
    <button class="btn" style="border:0;padding:0 6px" aria-label="Light or dark">◐</button>
    <button class="btn" style="border:0;padding:0 6px;position:relative" aria-label="Alerts">${ic(I.bell).replace('<svg', '<svg width="16" height="16" stroke="currentColor" fill="none" stroke-width="1.75"')}<span class="dot warn" style="position:absolute;top:6px;right:4px"></span></button>`;
})();
