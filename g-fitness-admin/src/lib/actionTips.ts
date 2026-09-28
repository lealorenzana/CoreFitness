/**
 * What an action *does*, for the buttons whose words say only what they are.
 * TooltipLayer shows one of these on hover or focus when a button's visible
 * text matches — exactly, or as its first words ("Approve selected") — and
 * the button has no tip of its own.
 *
 * Every sentence is a claim about the system and must stay true to its rules
 * (CLAUDE.md): approving grants the free tier and sells nothing; archiving
 * deletes nothing; a freeze credits its days back; a void is same-day, before
 * the drawer closes. Change a rule, change its sentence here.
 */
export const ACTION_TIPS: Record<string, string> = {
  approve: 'Lets them in, active on the free plan — they have paid nothing yet, so no paid plan is started',
  reject: 'Turns the request down. Nothing about them is deleted',
  decline: 'Turns the request down. Nothing about them is deleted',
  archive: 'Hides them from the working lists. Nothing is deleted, and they can be restored',
  restore: 'Brings them back onto the working lists',
  unarchive: 'Brings them back onto the working lists',
  freeze: 'Pauses the membership: no access while frozen, and the frozen days are added back to the end date',
  unfreeze: 'Ends the pause; the frozen days are already added back to the end date',
  'record payment': 'Records cash received, with its own numbered receipt, into today\'s drawer',
  'record cash sale': 'Sells at the counter: the stock goes down and the money joins today\'s drawer',
  void: 'Undoes a sale made today, before the drawer is closed; the stock goes back',
  suspend: 'Pauses their access. Nothing is deleted, and it can be undone',
  reactivate: 'Gives their access back',
  export: 'Downloads what is on screen as a spreadsheet',
  'export csv': 'Downloads what is on screen as a spreadsheet',
  'export list': 'Downloads this list as a spreadsheet',
  'export data': 'Downloads this person\'s own data — the same copy they can take themselves',
  print: 'Opens the print dialog; choose "Save as PDF" there for a digital copy',
  'send announcement': 'Sends it to members\' phones as a notification, and keeps it on their Inbox',
  'withdraw it now': 'Ends Core Fitness\'s support access at once',
  'check in': 'Records a visit now, for today\'s attendance',
  retire: 'Stops selling it. Everyone already on it keeps it',
  hide: 'Hidden from members here; nothing is deleted',
  'mark solved': 'Closes the question. Write again to reopen it',
};

/** The tip for a button's visible words, or null. */
export function actionTip(words: string): string | null {
  const w = words.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!w || w.length > 40) return null;
  if (ACTION_TIPS[w]) return ACTION_TIPS[w];
  const hit = Object.keys(ACTION_TIPS)
    .filter((k) => w.startsWith(k + ' '))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? ACTION_TIPS[hit] : null;
}
