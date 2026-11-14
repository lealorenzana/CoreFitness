/**
 * What you run → the animated explainer beside the switches (owner, 2026-11-14: "when they hover there should
 * be a motion graphics of what it is about … remove the phone and replace it with the animated tutorial, or if
 * phone view is needed then use the phone style of tutorial").
 *
 * One short story per part of the system (`platform_features.key`): a frame (the member's phone, the owner's
 * screen, or the lobby TV), the elements on it, and 2–4 beats. Beat i is said in steps[i]; an element with
 * `at` appears at that beat, `tap` is pressed at that beat, `hit` is highlighted from that beat. The words of
 * WHAT each part is come from the database (`platform_features.description`, shown under the frame); these
 * beats only act out HOW it is used, and every beat is something the system really does. Names on the
 * screens are samples and the frame says so. English and Filipino, as in lib/guides.ts.
 */

export type L = { en: string; fil: string };

export type El =
  | { t: 'head'; text: string; at?: number }
  | { t: 'row'; text: string; sub?: string; pill?: string; at?: number; hit?: number }
  | { t: 'btn'; text: string; at?: number; tap?: number; done?: string }
  | { t: 'bubble'; side: 'l' | 'r'; text: string; who?: string; at?: number }
  | { t: 'bar'; label: string; from: number; to: number; at: number; note?: string }
  | { t: 'toast'; title: string; text: string; at: number }
  | { t: 'qr'; at?: number }
  | { t: 'tick'; text: string; at: number }
  | { t: 'chips'; items: string[]; hit: number; at?: number }
  | { t: 'tiles'; n: number; lock?: boolean; at?: number }
  | { t: 'chart'; values: number[]; at: number }
  | { t: 'float'; text: string; at: number };

export type Frame = 'phone' | 'desk' | 'tv';

export interface FeatureShow { frame: Frame; screen: El[]; steps: L[]; guide?: string }

export const FEATURE_SHOWS: Record<string, FeatureShow> = {
  checkin: {
    frame: 'phone', guide: 'kiosk',
    screen: [
      { t: 'head', text: 'Check in' },
      { t: 'qr' },
      { t: 'row', text: 'Code 7K2 QF9', sub: 'or type it at the desk' },
      { t: 'tick', text: 'Checked in · 6:02 PM', at: 2 },
    ],
    steps: [
      { en: 'A member opens Check in on their phone.', fil: 'Bubuksan ng member ang Check in sa phone nila.' },
      { en: 'The desk or the kiosk scans the QR — or types the code.', fil: 'Isa-scan ng desk o kiosk ang QR — o ita-type ang code.' },
      { en: 'They are in, and it counts on Attendance. A frozen or expired membership is refused.', fil: 'Pasok na, at bilang sa Attendance. Hindi tatanggapin ang frozen o expired.' },
    ],
  },
  classes: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Classes · Today' },
      { t: 'row', text: '6:00 PM  HIIT', sub: 'Coach Mia · 8 of 12', hit: 1 },
      { t: 'row', text: '7:30 PM  Mobility', sub: 'Coach Leo · 3 of 10' },
      { t: 'btn', text: 'Book', tap: 1, done: 'Booked · 9 of 12' },
      { t: 'tick', text: 'Full? You join the waitlist', at: 2 },
    ],
    steps: [
      { en: 'Your weekly timetable makes each day’s classes by itself.', fil: 'Kusang ginagawa ng weekly timetable ang mga klase bawat araw.' },
      { en: 'A member books a class; the seats count down.', fil: 'Magbo-book ang member; bababa ang bilang ng upuan.' },
      { en: 'A full class takes no more — the next ones wait in line.', fil: 'Hindi na tatanggap ang punong klase — pipila ang susunod.' },
    ],
  },
  coaching: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Coach' },
      { t: 'row', text: 'Coach Mia', sub: 'Strength · free Tue, Thu', hit: 1 },
      { t: 'row', text: 'Coach Leo', sub: 'Mobility · free Mon, Wed' },
      { t: 'btn', text: 'Ask for a session', tap: 1, done: 'Asked — Mia decides' },
      { t: 'tick', text: 'Mia said yes · Thu 5:00 PM', at: 2 },
    ],
    steps: [
      { en: 'Members see your coaches and the hours each one is free.', fil: 'Makikita ng members ang mga coach at ang oras na libre sila.' },
      { en: 'They ask for a one-to-one session at a free time.', fil: 'Hihingi sila ng one-on-one session sa libreng oras.' },
      { en: 'The coach decides in their own app, and the member is told.', fil: 'Ang coach ang magdedesisyon sa sarili nilang app, at sasabihan ang member.' },
    ],
  },
  chat: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Coach Mia' },
      { t: 'bubble', side: 'r', text: 'Can we move Thursday to 6?' },
      { t: 'bubble', side: 'l', text: '6 works. See you then!', at: 1 },
      { t: 'bubble', side: 'l', text: 'Bring your belt 💪', at: 2 },
    ],
    steps: [
      { en: 'A member writes to a coach they train with.', fil: 'Magme-message ang member sa coach na nagte-train sa kanila.' },
      { en: 'The coach answers from their own app.', fil: 'Sasagot ang coach mula sa sarili nilang app.' },
      { en: 'Only the two of them read it.', fil: 'Silang dalawa lang ang makakabasa.' },
    ],
  },
  rooms: {
    frame: 'phone',
    screen: [
      { t: 'head', text: '12-week package · Mia' },
      { t: 'chips', items: ['Chat', 'Classwork', 'Progress'], hit: 1 },
      { t: 'row', text: 'Week 3 · Lower body', sub: 'due Friday', pill: 'Done', at: 1, hit: 2 },
      { t: 'bar', label: 'Package', from: 0.25, to: 0.33, at: 2, note: '4 of 12 weeks' },
    ],
    steps: [
      { en: 'Each coaching package gets its own room.', fil: 'May sariling room ang bawat coaching package.' },
      { en: 'The coach posts classwork; the trainee marks it done.', fil: 'Magpo-post ng classwork ang coach; mamarkahan ng trainee kapag tapos.' },
      { en: 'Both see the progress through the package.', fil: 'Pareho nilang makikita ang progress sa package.' },
    ],
  },
  engagement: {
    frame: 'phone', guide: 'rewards',
    screen: [
      { t: 'head', text: 'Rewards' },
      { t: 'row', text: '1,240 points', sub: 'your balance', pill: '+20', at: 0, hit: 1 },
      { t: 'row', text: 'Free protein shake', sub: '800 points', at: 1 },
      { t: 'btn', text: 'Redeem', tap: 2, done: 'Ask at the desk' },
    ],
    steps: [
      { en: 'Members earn for turning up, training and finishing challenges.', fil: 'Nakakaipon ang members sa pagpunta, pag-training at pagtapos ng challenges.' },
      { en: 'They pick a reward you set.', fil: 'Pipili sila ng reward na itinakda mo.' },
      { en: 'The desk approves it and hands it over.', fil: 'Aaprubahan ng desk at iaabot ito.' },
    ],
  },
  points: {
    frame: 'phone', guide: 'rewards',
    screen: [
      { t: 'head', text: 'Today' },
      { t: 'tick', text: 'Checked in', at: 0 },
      { t: 'float', text: '+10 points', at: 1 },
      { t: 'row', text: 'Balance', sub: 'spend them on Rewards', pill: '1,250', at: 2 },
    ],
    steps: [
      { en: 'A visit, a workout or a challenge pays points by the rules you set.', fil: 'Ang pagpunta, workout o challenge ay may points ayon sa patakaran mo.' },
      { en: 'They land in the member’s balance at once.', fil: 'Papasok agad ito sa balance ng member.' },
      { en: 'Off: nothing pays or promises points — badges and challenges stay.', fil: 'Kapag naka-off: walang points na ibibigay o ipapangako — tuloy pa rin ang badges at challenges.' },
    ],
  },
  quests: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'This week' },
      { t: 'row', text: 'Train 3 times', sub: 'quest · resets Monday' },
      { t: 'bar', label: 'Progress', from: 0.33, to: 1, at: 1, note: '3 of 3' },
      { t: 'tick', text: 'Quest done · points paid', at: 2 },
    ],
    steps: [
      { en: 'A small challenge waits every week.', fil: 'May maliit na challenge bawat linggo.' },
      { en: 'Each visit or workout moves it on.', fil: 'Bawat pagpunta o workout ay nagpapausad nito.' },
      { en: 'Done pays once; Monday brings a new one.', fil: 'Isang beses ang bayad kapag tapos; may bago sa Lunes.' },
    ],
  },
  referrals: {
    frame: 'phone', guide: 'invite',
    screen: [
      { t: 'head', text: 'Invite a friend' },
      { t: 'row', text: 'Your code  LEAKOD', sub: 'share your link' },
      { t: 'btn', text: 'Share', tap: 0 },
      { t: 'row', text: 'Ana joined', sub: 'waiting for her first payment', at: 1 },
      { t: 'tick', text: 'Ana paid — your reward is ready', at: 2 },
    ],
    steps: [
      { en: 'A member shares their own code or link.', fil: 'Ibabahagi ng member ang sarili nilang code o link.' },
      { en: 'A friend joins through it.', fil: 'Sasali ang kaibigan gamit iyon.' },
      { en: 'When the friend first pays, both are rewarded — points, or your desk reward if you run no points.', fil: 'Kapag unang nagbayad ang kaibigan, pareho silang may reward — points, o ang desk reward mo kung walang points.' },
    ],
  },
  squads: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Team · Iron Four' },
      { t: 'row', text: 'Mia · Leo · Ana · Jo', sub: '4 friends, one weekly target' },
      { t: 'bar', label: 'Team week', from: 0.4, to: 1, at: 1, note: '10 of 10 workouts' },
      { t: 'bar', label: 'Whole gym goal', from: 0.5, to: 0.62, at: 2, note: '310 of 500 days' },
    ],
    steps: [
      { en: 'Two to five friends make a team.', fil: 'Dalawa hanggang lima ang bubuo ng team.' },
      { en: 'Every workout adds to the team’s weekly target.', fil: 'Bawat workout ay dagdag sa weekly target ng team.' },
      { en: 'And one goal for the whole gym, everyone adding to it.', fil: 'At isang goal para sa buong gym, lahat ay nag-aambag.' },
    ],
  },
  seasons: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'November season' },
      { t: 'row', text: '1  Leo', pill: '1,420', hit: 1 },
      { t: 'row', text: '2  Mia', pill: '1,380' },
      { t: 'row', text: '3  You', pill: '1,250', hit: 2 },
    ],
    steps: [
      { en: 'Each month is a season with its own boards.', fil: 'Bawat buwan ay isang season na may sariling boards.' },
      { en: 'Only members who choose to join are shown.', fil: 'Ang mga sumali lang ang ipapakita.' },
      { en: 'At the end, you hand over the rewards.', fil: 'Sa dulo, ikaw ang mag-aabot ng rewards.' },
    ],
  },
  equipment: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Equipment' },
      { t: 'row', text: 'Leg press', sub: 'Floor 2 · by the window' },
      { t: 'row', text: 'Treadmill 3', sub: 'Cardio area', pill: 'Under repair', at: 2 },
      { t: 'btn', text: 'Report a problem', tap: 1, done: 'Sent to the desk' },
    ],
    steps: [
      { en: 'Members see where each machine is.', fil: 'Makikita ng members kung nasaan ang bawat makina.' },
      { en: 'Broken? They report it from the app.', fil: 'Sira? Ire-report nila sa app.' },
      { en: 'You mark it under repair, and everyone sees.', fil: 'Mamarkahan mo itong under repair, at makikita ng lahat.' },
    ],
  },
  front_desk: {
    frame: 'desk',
    screen: [
      { t: 'head', text: 'Record payment' },
      { t: 'row', text: 'Mia Reyes', sub: 'Monthly · ₱1,500 · cash', hit: 0 },
      { t: 'btn', text: 'Record payment', tap: 1, done: 'Receipt CF-0142' },
      { t: 'row', text: 'Membership', sub: 'active until Dec 14', pill: 'Renewed', at: 2 },
    ],
    steps: [
      { en: 'Find the member and the plan they are paying for.', fil: 'Hanapin ang member at ang plan na binabayaran.' },
      { en: 'Record it — every payment gets its own receipt number.', fil: 'I-record — may sariling receipt number ang bawat bayad.' },
      { en: 'The membership moves on, and the audit log keeps who did it.', fil: 'Uusad ang membership, at itatala ng audit log kung sino ang gumawa.' },
    ],
  },
  online_pay: {
    frame: 'phone', guide: 'online-pay',
    screen: [
      { t: 'head', text: 'Renew' },
      { t: 'row', text: 'Monthly · ₱1,500', hit: 0 },
      { t: 'btn', text: 'Pay in the app', tap: 1, done: 'Sent — the desk confirms' },
      { t: 'tick', text: 'Confirmed · receipt CF-0143', at: 2 },
    ],
    steps: [
      { en: 'A member renews from their phone.', fil: 'Magre-renew ang member mula sa phone nila.' },
      { en: 'They pay by GCash, Maya or bank and send it in.', fil: 'Magbabayad sila sa GCash, Maya o bangko at ipapadala ito.' },
      { en: 'The desk confirms it; it shows in Payments with a receipt number.', fil: 'Kukumpirmahin ng desk; lalabas ito sa Payments na may receipt number.' },
    ],
  },
  requests: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Membership' },
      { t: 'row', text: 'Freeze for 2 weeks', sub: 'reason: travelling', hit: 0 },
      { t: 'btn', text: 'Send request', tap: 1, done: 'Sent — the desk decides' },
      { t: 'tick', text: 'Frozen · days added back', at: 2 },
    ],
    steps: [
      { en: 'A member asks to freeze or cancel, with a reason.', fil: 'Hihingi ang member na i-freeze o i-cancel, may dahilan.' },
      { en: 'It reaches the desk — nothing changes yet.', fil: 'Darating ito sa desk — wala pang nagbabago.' },
      { en: 'The desk decides; frozen days go back on the end date.', fil: 'Ang desk ang magdedesisyon; ibabalik ang frozen na araw sa expiry.' },
    ],
  },
  shop: {
    frame: 'phone', guide: 'shop',
    screen: [
      { t: 'head', text: 'Shop' },
      { t: 'tiles', n: 4 },
      { t: 'row', text: 'Whey shake', sub: '₱120 · 14 left', hit: 1 },
      { t: 'tick', text: 'Sold at the desk · 13 left', at: 2 },
    ],
    steps: [
      { en: 'Members browse what you sell.', fil: 'Titingnan ng members ang mga binebenta mo.' },
      { en: 'They buy it at the counter.', fil: 'Bibilhin nila ito sa counter.' },
      { en: 'Each sale takes one off the stock count.', fil: 'Bawat benta ay bawas sa stock.' },
    ],
  },
  gym_chat: {
    frame: 'phone', guide: 'gym-chat',
    screen: [
      { t: 'head', text: 'Gym chat' },
      { t: 'bubble', side: 'l', who: 'Coach Leo', text: 'Leg day 6pm, who’s in? 💪' },
      { t: 'bubble', side: 'r', text: 'I’m in!', at: 1 },
      { t: 'bubble', side: 'l', who: 'Front desk', text: 'Open till 10pm tonight', at: 2 },
    ],
    steps: [
      { en: 'One group chat for the whole gym.', fil: 'Isang group chat para sa buong gym.' },
      { en: 'Members, coaches, the desk and you, together.', fil: 'Members, coaches, desk at ikaw, sama-sama.' },
      { en: 'You can remove a message or stop someone posting.', fil: 'Puwede mong burahin ang mensahe o pigilan ang isang tao sa pag-post.' },
    ],
  },
  lobby_tv: {
    frame: 'tv', guide: 'lobby-tv',
    screen: [
      { t: 'head', text: 'Today · 6:00 PM HIIT' },
      { t: 'row', text: '42 checked in', at: 1 },
      { t: 'row', text: 'Open till 10pm tonight', at: 2 },
    ],
    steps: [
      { en: 'A computer plugged into a TV in your gym.', fil: 'Isang computer na nakakabit sa TV ng gym mo.' },
      { en: 'It shows today’s classes and check-ins, live.', fil: 'Ipinapakita nito ang mga klase at check-ins ngayon, live.' },
      { en: 'Your headline and panels, in your design.', fil: 'Ang headline at panels mo, sa sarili mong design.' },
    ],
  },
  progress: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Progress' },
      { t: 'chart', values: [0.3, 0.4, 0.38, 0.52, 0.6, 0.72], at: 1 },
      { t: 'row', text: 'Waist 78 cm', sub: 'logged today', at: 0 },
      { t: 'row', text: 'Coach can see', sub: 'the member chooses', pill: 'On', at: 2 },
    ],
    steps: [
      { en: 'Members log measurements and workouts.', fil: 'Itatala ng members ang sukat at workouts nila.' },
      { en: 'The app draws how they are doing over time.', fil: 'Ipapakita ng app ang usad nila sa paglipas ng panahon.' },
      { en: 'The member decides what their coach may see.', fil: 'Ang member ang magpapasya kung ano ang makikita ng coach.' },
    ],
  },
  photos: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Progress photos' },
      { t: 'tiles', n: 4, lock: true },
      { t: 'row', text: 'Share with Coach Mia', pill: 'On', at: 1 },
      { t: 'tick', text: 'Only you and Mia can see them', at: 2 },
    ],
    steps: [
      { en: 'Photos are private to the member.', fil: 'Pribado sa member ang mga litrato.' },
      { en: 'They can choose to share them with a coach.', fil: 'Puwede nilang piliing ibahagi sa coach.' },
      { en: 'No one else sees them — not even the desk.', fil: 'Walang ibang makakakita — kahit ang desk.' },
    ],
  },
  programs: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Program · Strong Start' },
      { t: 'row', text: 'Week 1', pill: 'Done' },
      { t: 'row', text: 'Week 2 · Day 3', sub: 'Lower body', hit: 1 },
      { t: 'btn', text: 'Start workout', tap: 2 },
    ],
    steps: [
      { en: 'You build programs that run for weeks.', fil: 'Gagawa ka ng programs na tumatagal nang ilang linggo.' },
      { en: 'Members follow them day by day.', fil: 'Susundan ito ng members araw-araw.' },
      { en: 'Each day opens as a workout to log.', fil: 'Bawat araw ay bubukas bilang workout na itatala.' },
    ],
  },
  targets: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Targets' },
      { t: 'row', text: 'Squat 80 kg', sub: 'by December' },
      { t: 'bar', label: 'Best so far', from: 0.7, to: 1, at: 1, note: '80 of 80 kg' },
      { t: 'tick', text: 'Reached — the app checked it', at: 2 },
    ],
    steps: [
      { en: 'A member sets a target: a weight, a lift, visits a week.', fil: 'Magtatakda ang member ng target: timbang, buhat, o pagpunta bawat linggo.' },
      { en: 'Their logs move it on by themselves.', fil: 'Kusang uusad ito mula sa mga tala nila.' },
      { en: 'The app marks it reached — not a hand-ticked box.', fil: 'Ang app ang magmamarka na naabot — hindi mano-manong tsek.' },
    ],
  },
  push: {
    frame: 'phone', guide: 'notifications',
    screen: [
      { t: 'toast', title: 'Core Fitness', text: 'Closed on Monday for the holiday', at: 1 },
      { t: 'head', text: 'Today' },
      { t: 'row', text: 'Announcement', sub: 'Closed on Monday for the holiday', at: 2 },
    ],
    steps: [
      { en: 'You write an announcement.', fil: 'Susulat ka ng anunsyo.' },
      { en: 'It reaches members’ phones — even closed, once they turn notifications on.', fil: 'Darating ito sa phone ng members — kahit sarado ang app, basta naka-on ang notifications nila.' },
      { en: 'And it stays in the app for anyone who missed it.', fil: 'At mananatili sa app para sa hindi nakakita.' },
    ],
  },
  events: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Events' },
      { t: 'row', text: 'Fun run · Sat 6 AM', sub: 'Baywalk · 24 going', hit: 0 },
      { t: 'btn', text: 'I’m going', tap: 1, done: 'You’re going' },
      { t: 'row', text: 'Going', sub: 'Mia, Leo, Ana and 22 more', at: 2 },
    ],
    steps: [
      { en: 'A one-off event: a fun run, a seminar, an open day.', fil: 'Isang beses na event: fun run, seminar, open day.' },
      { en: 'Members sign up in the app.', fil: 'Magsa-sign up ang members sa app.' },
      { en: 'You see who is coming.', fil: 'Makikita mo kung sino ang darating.' },
    ],
  },
  reels: {
    frame: 'phone', guide: 'reels',
    screen: [
      { t: 'head', text: 'Reels' },
      { t: 'tiles', n: 2, at: 0 },
      { t: 'row', text: 'Three stretches before you lift', sub: 'from your gym', at: 1 },
      { t: 'float', text: '♥ 12', at: 2 },
    ],
    steps: [
      { en: 'Paste a YouTube, TikTok, Facebook or Instagram link — or upload a video.', fil: 'I-paste ang link mula YouTube, TikTok, Facebook o Instagram — o mag-upload ng video.' },
      { en: 'Members watch them in the app.', fil: 'Mapapanood ito ng members sa app.' },
      { en: 'They can like them; you can hide or remove any.', fil: 'Puwede nilang i-like; puwede mong itago o burahin.' },
    ],
  },
  assistant: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Assistant' },
      { t: 'bubble', side: 'r', text: 'What time do you close today?' },
      { t: 'bubble', side: 'l', text: 'We’re open until 10:00 PM today.', at: 1 },
      { t: 'bubble', side: 'l', text: 'Your Monthly plan runs to Dec 14.', at: 2 },
    ],
    steps: [
      { en: 'A member asks in plain words.', fil: 'Magtatanong ang member sa simpleng salita.' },
      { en: 'It answers from your gym’s own settings.', fil: 'Sasagot ito mula sa sariling settings ng gym mo.' },
      { en: 'And from their own membership and bookings.', fil: 'At mula sa sarili nilang membership at bookings.' },
    ],
  },
  slots: {
    frame: 'phone',
    screen: [
      { t: 'head', text: 'Book a time · Today' },
      { t: 'row', text: '6:00 – 7:30 AM', sub: '24 of 30', hit: 1 },
      { t: 'row', text: '7:30 – 9:00 AM', sub: 'Full', pill: 'Full' },
      { t: 'btn', text: 'Book', tap: 1, done: 'Your place is kept' },
      { t: 'tick', text: 'Checked in — your place was kept', at: 2 },
    ],
    steps: [
      { en: 'You set the slots and how many people each one takes.', fil: 'Ikaw ang magtatakda ng slots at ilan ang kasya sa bawat isa.' },
      { en: 'Members book a time, within the rules you choose.', fil: 'Magbo-book ang members ng oras, ayon sa patakarang pinili mo.' },
      { en: 'At the door a booking keeps their place — the rest is your choice.', fil: 'Sa pinto, may lugar ang nag-book — ang iba ay nasa iyo.' },
    ],
  },
  analytics: {
    frame: 'desk',
    screen: [
      { t: 'head', text: 'Reports' },
      { t: 'chart', values: [0.35, 0.5, 0.45, 0.62, 0.7, 0.82], at: 0 },
      { t: 'row', text: 'Members to watch', sub: 'no visit in 3 weeks', pill: '6', at: 1 },
      { t: 'btn', text: 'Call list', tap: 2 },
    ],
    steps: [
      { en: 'Money and visits, month by month.', fil: 'Pera at pagpunta, buwan-buwan.' },
      { en: 'Who is slipping away, before they leave.', fil: 'Sino ang nawawala na, bago pa sila umalis.' },
      { en: 'A list to call — from real records, never guesses.', fil: 'Listahan ng tatawagan — mula sa totoong tala, hindi hula.' },
    ],
  },
};

export const showFor = (key: string): FeatureShow | null => FEATURE_SHOWS[key] ?? null;
