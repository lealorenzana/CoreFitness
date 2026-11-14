/**
 * The animated set-up guides (owner, 2026-11-14: "there should be a motion graphics that helps them know what
 * to do … find all that kind of things that needed tutorials"). Each guide is a few steps; each step names
 * the real page and button (read from the screens, not invented) and shows an animated scene
 * (components/guides/GuidePlayer.tsx). English and Filipino side by side — the admin app has no translation
 * layer, so the words live here.
 *
 * BYTE-IDENTICAL in g-fitness-admin and g-fitness-member — diff before changing one. Change a guide when the
 * screen it describes changes.
 */

export type L = { en: string; fil: string };

export type Scene =
  | { k: 'browser'; url: string; cta: string }
  | { k: 'nav'; path: string[] }
  | { k: 'toggle'; label: string }
  | { k: 'form'; label: string; value: string; cta: string; secret?: boolean }
  | { k: 'phone'; screen: 'pay' | 'qr' | 'install' | 'notify' | 'chat' | 'reel' | 'share' | 'allow' }
  | { k: 'kiosk' }
  | { k: 'tv'; key?: string }
  | { k: 'cable' }
  | { k: 'slip' }
  | { k: 'hold'; label: string }
  | { k: 'done'; text: string };

export interface GuideStep { title: L; text: L; scene: Scene }
export interface Guide {
  id: string;
  /** Who reads it: the owner/desk (admin app), members (member app). Member guides are listed in both. */
  for: 'owner' | 'member';
  title: L;
  blurb: L;
  /** Where the owner does it in the admin app (opened by "Take me there"). */
  where?: string;
  steps: GuideStep[];
}

export const GUIDES: Guide[] = [
  {
    id: 'online-pay', for: 'owner', where: '/gym-app?tab=pay',
    title: { en: 'Online payments (PayMongo)', fil: 'Online na bayad (PayMongo)' },
    blurb: { en: 'Members pay you in the app by GCash, Maya or card — straight to your own PayMongo account.', fil: 'Magbabayad ang members sa app gamit ang GCash, Maya o card — diretso sa sarili mong PayMongo account.' },
    steps: [
      { scene: { k: 'browser', url: 'paymongo.com', cta: 'Sign up' },
        title: { en: 'Make a PayMongo account', fil: 'Gumawa ng PayMongo account' },
        text: { en: 'At paymongo.com, with your gym’s email. Opening it is free; PayMongo takes a fee from each payment.', fil: 'Sa paymongo.com, gamit ang email ng gym mo. Libre ang pagbukas; may kaltas ang PayMongo sa bawat bayad.' } },
      { scene: { k: 'browser', url: 'dashboard.paymongo.com', cta: 'Activate account' },
        title: { en: 'Get your business checked', fil: 'Ipa-verify ang negosyo mo' },
        text: { en: 'PayMongo asks for your DTI or SEC registration, a valid ID and the bank account it pays you out to. Until it activates you, only test mode works — that is fine for trying it.', fil: 'Hihingin ng PayMongo ang DTI o SEC registration, valid ID at bank account na paghuhulugan ng pera. Habang hindi pa activated, test mode lang ang gagana — ayos lang iyon para masubukan.' } },
      { scene: { k: 'browser', url: 'dashboard.paymongo.com/developers', cta: 'API keys' },
        title: { en: 'Copy your secret key', fil: 'Kopyahin ang secret key' },
        text: { en: 'Developers → API keys. It starts with sk_test_ (test) or sk_live_ (real money). Never share it.', fil: 'Developers → API keys. Nagsisimula ito sa sk_test_ (test) o sk_live_ (totoong pera). Huwag itong ibigay kahit kanino.' } },
      { scene: { k: 'form', label: 'Secret key', value: 'sk_test_51Pq9xT', cta: 'Connect PayMongo', secret: true },
        title: { en: 'Paste it in Your app → Payments', fil: 'I-paste sa Your app → Payments' },
        text: { en: 'Paste the key and press Connect PayMongo. Core Fitness checks it with PayMongo and stores it encrypted — it is never shown again.', fil: 'I-paste ang key at pindutin ang Connect PayMongo. Susuriin ito ng Core Fitness sa PayMongo at itatago nang naka-encrypt — hindi na ito ipapakita ulit.' } },
      { scene: { k: 'phone', screen: 'pay' },
        title: { en: 'Try it with no real money', fil: 'Subukan nang walang totoong pera' },
        text: { en: 'In the member app, renew a plan and choose Pay in the app. Use one of PayMongo’s test cards. It appears in Payments with a receipt number.', fil: 'Sa member app, mag-renew ng plan at piliin ang Pay in the app. Gamitin ang test card ng PayMongo. Lalabas ito sa Payments na may receipt number.' } },
      { scene: { k: 'done', text: 'sk_live_ connected' },
        title: { en: 'Go live', fil: 'Gawing live' },
        text: { en: 'When PayMongo activates you, connect your sk_live_ key the same way. Money lands in your PayMongo balance and is paid out to your bank — Core Fitness never holds it.', fil: 'Kapag activated ka na ng PayMongo, i-connect ang sk_live_ key sa parehong paraan. Papasok ang pera sa PayMongo balance mo at ihuhulog sa bangko mo — hindi ito hinahawakan ng Core Fitness.' } },
    ],
  },
  {
    id: 'kiosk', for: 'owner', where: '/attendance',
    title: { en: 'Self check-in kiosk', fil: 'Kiosk para sa sariling check-in' },
    blurb: { en: 'A computer or tablet by the door checks members in by their QR — no one needed at the desk.', fil: 'Isang computer o tablet sa pinto ang magche-check in sa members gamit ang QR nila — kahit walang tao sa desk.' } ,
    steps: [
      { scene: { k: 'kiosk' },
        title: { en: 'What you need', fil: 'Ang kailangan mo' },
        text: { en: 'A laptop or PC with a webcam, or a tablet, placed by the door. It stays signed in as the owner or the front desk.', fil: 'Isang laptop o PC na may webcam, o isang tablet, sa may pinto. Naka-sign in ito bilang owner o front desk.' } },
      { scene: { k: 'nav', path: ['Attendance', 'Open kiosk'] },
        title: { en: 'Open it from Attendance', fil: 'Buksan sa Attendance' },
        text: { en: 'Attendance → Open kiosk. When the browser asks to use the camera, press Allow.', fil: 'Attendance → Open kiosk. Kapag nagtanong ang browser kung puwedeng gamitin ang camera, pindutin ang Allow.' } },
      { scene: { k: 'phone', screen: 'qr' },
        title: { en: 'Members show their QR', fil: 'Ipapakita ng member ang QR nila' },
        text: { en: 'They tap Check in in their app and hold the QR up to the camera — or type their six-character code.', fil: 'Pipindutin nila ang Check in sa app at itatapat ang QR sa camera — o ita-type ang anim na letrang code nila.' } },
      { scene: { k: 'done', text: 'Mia — checked in' },
        title: { en: 'Checked in, with the desk’s rules', fil: 'Naka-check in, sa parehong patakaran ng desk' },
        text: { en: 'The screen shows only their first name and “checked in”. A frozen or expired membership is refused, as at the desk.', fil: 'Pangalan lang at “checked in” ang lalabas. Hindi tatanggapin ang frozen o expired na membership, gaya sa desk.' } },
      { scene: { k: 'hold', label: 'Exit' },
        title: { en: 'Leaving the kiosk', fil: 'Paglabas sa kiosk' },
        text: { en: 'Press and hold Exit. A quick tap from someone in line will not unlock the desk.', fil: 'Pindutin nang matagal ang Exit. Hindi ito mabubuksan ng mabilis na pindot ng nakapila.' } },
    ],
  },
  {
    id: 'lobby-tv', for: 'owner', where: '/gym-app?tab=tv',
    title: { en: 'Lobby TV', fil: 'Lobby TV' },
    blurb: { en: 'Today’s classes, check-ins and announcements on a TV in your gym, updating by itself.', fil: 'Mga klase ngayon, check-ins at anunsyo sa TV ng gym mo, kusang nag-a-update.' },
    steps: [
      { scene: { k: 'toggle', label: 'A lobby TV?' },
        title: { en: 'Switch it on', fil: 'I-on ito' },
        text: { en: 'Your app → What you run → A lobby TV? → Yes. It needs a Core Fitness plan that includes the TV (Your plan shows which).', fil: 'Your app → What you run → A lobby TV? → Yes. Kailangang kasama ang TV sa Core Fitness plan mo (makikita sa Your plan).' } },
      { scene: { k: 'form', label: 'Headline', value: 'Open till 10pm tonight', cta: 'Save' },
        title: { en: 'Design it', fil: 'Ayusin ang itsura' },
        text: { en: 'Your app → Lobby TV: a headline, which panels to show and how many seconds each stays up.', fil: 'Your app → Lobby TV: isang headline, aling panels ang ipapakita at ilang segundo bawat isa.' } },
      { scene: { k: 'cable' },
        title: { en: 'Connect a computer to the TV', fil: 'Ikonekta ang computer sa TV' },
        text: { en: 'Any gym computer, plugged into the TV with an HDMI cable, signed in as the owner or the desk.', fil: 'Kahit anong computer ng gym, nakakabit sa TV gamit ang HDMI cable, naka-sign in bilang owner o desk.' } },
      { scene: { k: 'tv', key: 'F11' },
        title: { en: 'Open the TV, full screen', fil: 'Buksan ang TV, full screen' },
        text: { en: 'Press Open the TV (or go to /tv) and press F11 for full screen.', fil: 'Pindutin ang Open the TV (o pumunta sa /tv) at pindutin ang F11 para full screen.' } },
      { scene: { k: 'tv' },
        title: { en: 'Leave it on — it is live', fil: 'Iwanang bukas — live ito' },
        text: { en: 'It updates by itself every 10 seconds: check-ins, today’s classes, announcements.', fil: 'Kusang nag-a-update kada 10 segundo: check-ins, mga klase ngayon, mga anunsyo.' } },
    ],
  },
  {
    id: 'door-checkin', for: 'owner', where: '/settings?tab=checkin',
    title: { en: 'Coach check-in and activities', fil: 'Check-in ng coach at mga activity' },
    blurb: { en: 'Coaches check in with their own QR; members can tag what they are doing today.', fil: 'Magche-check in ang coaches gamit ang sarili nilang QR; puwedeng i-tag ng members kung ano ang gagawin nila ngayon.' },
    steps: [
      { scene: { k: 'nav', path: ['Settings', 'Checking in'] },
        title: { en: 'Settings → Checking in', fil: 'Settings → Checking in' },
        text: { en: 'Everything about the door is on this tab.', fil: 'Nandito lahat tungkol sa pag-check in.' } },
      { scene: { k: 'toggle', label: 'Coaches check in too' },
        title: { en: 'Coaches check in too', fil: 'Mag-check in din ang coaches' },
        text: { en: 'Each coach gets a QR in their app. The desk or the kiosk scans it; you see who came in on Attendance → Today. A coach is never counted as a member visit.', fil: 'Bawat coach ay may QR sa app nila. Isa-scan ito ng desk o kiosk; makikita mo kung sino ang dumating sa Attendance → Today. Hindi ito binibilang na member visit.' } },
      { scene: { k: 'toggle', label: 'Members pick their activity' },
        title: { en: 'Members pick their activity', fil: 'Pipili ang member ng activity' },
        text: { en: 'Members tap what they are doing today on their QR screen and can make it their usual. The desk’s own tag still wins.', fil: 'Pipindutin ng member ang gagawin nila ngayon sa QR screen at puwedeng gawing “usual”. Ang tag ng desk pa rin ang masusunod.' } },
    ],
  },
  {
    id: 'invite', for: 'owner', where: '/invitations',
    title: { en: 'Invite staff, coaches and members', fil: 'Mag-imbita ng staff, coach at members' },
    blurb: { en: 'Each invitation is a login: they get a one-time password and set their own at first sign-in.', fil: 'Bawat imbitasyon ay isang login: may one-time password sila at gagawa ng sariling password sa unang sign-in.' },
    steps: [
      { scene: { k: 'nav', path: ['People', 'Invitations'] },
        title: { en: 'People → Invitations', fil: 'People → Invitations' },
        text: { en: 'Choose who is joining: Member, Coach or Front desk.', fil: 'Piliin kung sino ang sasali: Member, Coach o Front desk.' } },
      { scene: { k: 'form', label: 'Email', value: 'ana@email.com', cta: 'Review invitations' },
        title: { en: 'Add them', fil: 'Idagdag sila' },
        text: { en: 'An email each (name and mobile optional), or many at once from a CSV. No email? Use a username instead.', fil: 'Isang email bawat tao (opsyonal ang pangalan at mobile), o marami nang sabay mula sa CSV. Walang email? Gumamit ng username.' } },
      { scene: { k: 'slip' },
        title: { en: 'Hand over the login slip', fil: 'Ibigay ang login slip' },
        text: { en: 'A slip shows their username or email and a one-time password. Print it or show it. Emailed invites get it by email.', fil: 'Nakasulat sa slip ang username o email at one-time password nila. I-print o ipakita. Ang may email ay matatanggap ito sa email.' } },
      { scene: { k: 'phone', screen: 'allow' },
        title: { en: 'They sign in once, then choose a password', fil: 'Mag-sign in sila, tapos pipili ng password' },
        text: { en: 'Front desk signs in to this dashboard; coaches and members to the phone app (coaches on its Trainer tab). At first sign-in they set their own password.', fil: 'Sa dashboard na ito magsa-sign in ang front desk; sa phone app ang coaches at members (Trainer tab para sa coaches). Sa unang sign-in, gagawa sila ng sariling password.' } },
    ],
  },
  {
    id: 'plans', for: 'owner', where: '/membership-plans',
    title: { en: 'Plans and prices', fil: 'Mga plan at presyo' },
    blurb: { en: 'What you sell, what each plan unlocks, and how members renew.', fil: 'Ang mga binebenta mo, ano ang kasama sa bawat plan, at paano mag-renew ang members.' },
    steps: [
      { scene: { k: 'nav', path: ['Billing', 'Plans'] },
        title: { en: 'Billing → Plans', fil: 'Billing → Plans' },
        text: { en: 'Your plans on sale, what each unlocks, and members on a paid plan.', fil: 'Ang mga plan na binebenta mo, ano ang kasama, at mga member na may bayad na plan.' } },
      { scene: { k: 'form', label: 'Name members see', value: 'Monthly', cta: 'New plan' },
        title: { en: 'Add a plan', fil: 'Magdagdag ng plan' },
        text: { en: 'New plan → the name members see, the price (₱), how long it lasts and what it unlocks (class bookings, coaching).', fil: 'New plan → ang pangalang makikita ng members, presyo (₱), gaano katagal, at ano ang kasama (class bookings, coaching).' } },
      { scene: { k: 'phone', screen: 'pay' },
        title: { en: 'Members see it in their app', fil: 'Makikita ito ng members sa app' },
        text: { en: 'They choose it when they renew — at your desk, or in the app if online payments are on.', fil: 'Pipiliin nila ito kapag nag-renew — sa desk mo, o sa app kung naka-on ang online payments.' } },
      { scene: { k: 'done', text: 'Retired, history kept' },
        title: { en: 'Stop selling one', fil: 'Itigil ang pagbenta ng isa' },
        text: { en: 'Retire it instead of deleting: members already on it keep it, and its history stays.', fil: 'I-retire imbes na burahin: tuloy pa rin sa mga member na nasa plan na iyon, at mananatili ang history.' } },
    ],
  },
  {
    id: 'reels', for: 'owner', where: '/reels',
    title: { en: 'Reels', fil: 'Reels' },
    blurb: { en: 'Short videos for your members: paste a link or upload your own.', fil: 'Maiikling video para sa members: mag-paste ng link o mag-upload.' },
    steps: [
      { scene: { k: 'toggle', label: 'Reels?' },
        title: { en: 'Switch it on', fil: 'I-on ito' },
        text: { en: 'Your app → What you run → Reels? → Yes. Until then the page stays hidden.', fil: 'Your app → What you run → Reels? → Yes. Nakatago ang page hangga’t hindi naka-on.' } },
      { scene: { k: 'form', label: 'Link', value: 'tiktok.com/@gym/video/…', cta: 'Post' },
        title: { en: 'Training → Reels → post', fil: 'Training → Reels → mag-post' },
        text: { en: 'Paste a YouTube, TikTok, Facebook or Instagram link, or upload a short video (up to 15 MB). You, the desk and coaches can post.', fil: 'Mag-paste ng link mula YouTube, TikTok, Facebook o Instagram, o mag-upload ng maikling video (hanggang 15 MB). Puwedeng mag-post ikaw, ang desk at coaches.' } },
      { scene: { k: 'phone', screen: 'reel' },
        title: { en: 'Members watch on Today', fil: 'Panonoorin ng members sa Today' },
        text: { en: 'A strip on their Today screen and a full Reels page, with likes.', fil: 'May hanay sa Today screen nila at buong Reels page, may likes.' } },
      { scene: { k: 'done', text: 'Hidden' },
        title: { en: 'Edit, hide or remove', fil: 'I-edit, itago o burahin' },
        text: { en: 'You can edit, hide or remove any reel; the desk and coaches manage their own.', fil: 'Puwede mong i-edit, itago o burahin ang kahit anong reel; sariling post lang ang sa desk at coaches.' } },
    ],
  },
  {
    id: 'gym-chat', for: 'owner', where: '/gym-chat',
    title: { en: 'Gym chat', fil: 'Gym chat' },
    blurb: { en: 'One group chat for your members, coaches, front desk and you.', fil: 'Isang group chat para sa members, coaches, front desk at ikaw.' },
    steps: [
      { scene: { k: 'toggle', label: 'A group chat for your gym?' },
        title: { en: 'Switch it on', fil: 'I-on ito' },
        text: { en: 'Your app → What you run → A group chat for your gym? → Yes. Members with a membership that is active today are in it.', fil: 'Your app → What you run → A group chat for your gym? → Yes. Kasali ang members na may aktibong membership ngayon.' } },
      { scene: { k: 'phone', screen: 'chat' },
        title: { en: 'Everyone chats in one place', fil: 'Iisang lugar ang usapan' },
        text: { en: 'Members open it from the chat button in their app; you and the desk from Gym chat in the sidebar. Every message can be a push.', fil: 'Bubuksan ito ng members sa chat button ng app; ikaw at ang desk sa Gym chat sa sidebar. Puwedeng may push ang bawat mensahe.' } },
      { scene: { k: 'done', text: 'Pinned · Announce only' },
        title: { en: 'Keep it tidy', fil: 'Panatilihing maayos' },
        text: { en: 'Pin up to three messages, remove one with a reason, silence someone, or set announce-only so only staff and coaches post.', fil: 'Mag-pin ng hanggang tatlong mensahe, mag-alis nang may dahilan, patahimikin ang isang tao, o gawing announce-only para staff at coaches lang ang makapag-post.' } },
    ],
  },
  {
    id: 'day-pass', for: 'owner', where: '/settings?tab=walk-ins',
    title: { en: 'Day passes for walk-ins', fil: 'Day pass para sa walk-ins' },
    blurb: { en: 'Sell a one-day visit (or packs of 5 or 10) to guests without a membership.', fil: 'Magbenta ng isang araw na pasok (o pack ng 5 o 10) sa guests na walang membership.' },
    steps: [
      { scene: { k: 'nav', path: ['Settings', 'Walk-ins'] },
        title: { en: 'Settings → Walk-ins', fil: 'Settings → Walk-ins' },
        text: { en: 'Turn on Sell day passes to walk-ins.', fil: 'I-on ang Sell day passes to walk-ins.' } },
      { scene: { k: 'form', label: 'Day pass price (₱)', value: '150', cta: 'Save' },
        title: { en: 'Set the prices', fil: 'Ilagay ang presyo' },
        text: { en: 'A day pass, and packs of 5 and 10 if you sell them. Choose whether guests can book a class that day.', fil: 'Presyo ng day pass, at ng pack ng 5 at 10 kung meron. Piliin kung puwedeng mag-book ng klase ang guest sa araw na iyon.' } },
      { scene: { k: 'nav', path: ['Attendance', 'Walk-ins'] },
        title: { en: 'Sell one at the desk', fil: 'Magbenta sa desk' },
        text: { en: 'Attendance → Walk-ins. A guest with today’s pass is checked in like a member.', fil: 'Attendance → Walk-ins. Ang guest na may pass ngayong araw ay mache-check in na parang member.' } },
    ],
  },
  {
    id: 'shop', for: 'owner', where: '/shop',
    title: { en: 'Shop', fil: 'Shop' },
    blurb: { en: 'Sell drinks, supplements and gear at the desk, with stock counted for you.', fil: 'Magbenta ng inumin, supplements at gamit sa desk, at bilang ang stock para sa iyo.' },
    steps: [
      { scene: { k: 'nav', path: ['Billing', 'Shop'] },
        title: { en: 'Billing → Shop', fil: 'Billing → Shop' },
        text: { en: 'Add each product with a photo, a price and, if you want, its stock.', fil: 'Idagdag ang bawat produkto na may litrato, presyo at, kung gusto mo, stock.' } },
      { scene: { k: 'form', label: 'Product', value: 'Whey protein 1kg', cta: 'Add' },
        title: { en: 'Ring up a sale', fil: 'Mag-ring up ng benta' },
        text: { en: 'Tap the products on the ticket and record the sale; the stock goes down by itself.', fil: 'Pindutin ang mga produkto sa ticket at i-record ang benta; kusang bababa ang stock.' } },
      { scene: { k: 'done', text: '3 left — restock' },
        title: { en: 'Know when to restock', fil: 'Alamin kung kailan magre-restock' },
        text: { en: 'Products running low are listed so you can restock in time.', fil: 'Nakalista ang mga paubos na produkto para makapag-restock ka agad.' } },
    ],
  },
  {
    id: 'rewards', for: 'owner', where: '/rewards',
    title: { en: 'Points and rewards', fil: 'Points at rewards' },
    blurb: { en: 'Members earn points for coming in and training, and spend them on rewards you set.', fil: 'Nag-iipon ng points ang members sa pagpunta at pag-training, at ginagastos sa rewards na itinakda mo.' },
    steps: [
      { scene: { k: 'toggle', label: 'Points and rewards?' },
        title: { en: 'Switch it on', fil: 'I-on ito' },
        text: { en: 'Your app → What you run → Points and rewards? → Yes, and name your points if you like.', fil: 'Your app → What you run → Points and rewards? → Yes, at pangalanan ang points kung gusto mo.' } },
      { scene: { k: 'form', label: 'Reward', value: 'Free shaker · 300 pts', cta: 'Add reward' },
        title: { en: 'Engagement → Rewards', fil: 'Engagement → Rewards' },
        text: { en: 'Add rewards and how many points each costs.', fil: 'Magdagdag ng rewards at ilang points ang halaga ng bawat isa.' } },
      { scene: { k: 'done', text: 'Request approved' },
        title: { en: 'Hand it over', fil: 'Ibigay ang reward' },
        text: { en: 'A member claims one in the app; it shows under Requests. Approve it and hand it over at the desk.', fil: 'Kukunin ito ng member sa app; lalabas sa Requests. I-approve at iabot sa desk.' } },
    ],
  },
  {
    id: 'waiver', for: 'owner', where: '/settings?tab=waiver',
    title: { en: 'Waiver and health questions', fil: 'Waiver at health questions' },
    blurb: { en: 'Members sign your waiver in the app before booking.', fil: 'Pipirmahan ng members ang waiver mo sa app bago mag-book.' },
    steps: [
      { scene: { k: 'nav', path: ['Settings', 'Waiver'] },
        title: { en: 'Settings → Waiver', fil: 'Settings → Waiver' },
        text: { en: 'Write your waiver and publish it.', fil: 'Isulat ang waiver mo at i-publish.' } },
      { scene: { k: 'done', text: 'Version 2 published' },
        title: { en: 'Published words never change', fil: 'Hindi na nababago ang na-publish' },
        text: { en: 'Editing makes the next version; every signature keeps the words that person was shown.', fil: 'Ang pag-edit ay gagawa ng bagong bersyon; nakatabi sa bawat pirma ang mismong salitang nabasa ng tao.' } },
      { scene: { k: 'phone', screen: 'allow' },
        title: { en: 'Members sign before booking', fil: 'Pipirma ang members bago mag-book' },
        text: { en: 'With the health questions (PAR-Q). A “yes” suggests seeing a doctor; it never blocks them. Only the desk sees the answers, never coaches.', fil: 'Kasama ang health questions (PAR-Q). Ang “yes” ay payo na kumonsulta sa doktor; hindi sila hinaharang. Desk lang ang nakakakita ng sagot, hindi coaches.' } },
    ],
  },
  {
    id: 'install-app', for: 'member',
    title: { en: 'Install the app on your phone', fil: 'I-install ang app sa phone' },
    blurb: { en: 'Android or iPhone — the same app, no app store needed.', fil: 'Android o iPhone — iisang app, hindi kailangan ng app store.' },
    steps: [
      { scene: { k: 'browser', url: 'corefitness-gym.vercel.app/get-app', cta: 'Download the app' },
        title: { en: 'Android: open the download page in Chrome', fil: 'Android: buksan ang download page sa Chrome' },
        text: { en: 'Go to corefitness-gym.vercel.app/get-app and press the download button.', fil: 'Pumunta sa corefitness-gym.vercel.app/get-app at pindutin ang download button.' } },
      { scene: { k: 'phone', screen: 'install' },
        title: { en: 'Allow the install', fil: 'Payagan ang pag-install' },
        text: { en: 'Open the downloaded file. If the phone asks, allow Chrome to install apps, then press Install. Or, in Chrome’s menu, tap Install app.', fil: 'Buksan ang na-download na file. Kapag nagtanong ang phone, payagan ang Chrome na mag-install, tapos pindutin ang Install. O sa menu ng Chrome, pindutin ang Install app.' } },
      { scene: { k: 'phone', screen: 'share' },
        title: { en: 'iPhone: Safari → Share → Add to Home Screen', fil: 'iPhone: Safari → Share → Add to Home Screen' },
        text: { en: 'Open the same address in Safari, tap Share, then Add to Home Screen. It opens like any app.', fil: 'Buksan ang parehong address sa Safari, pindutin ang Share, tapos Add to Home Screen. Bubukas ito na parang ibang app.' } },
      { scene: { k: 'done', text: 'Signed in until you log out' },
        title: { en: 'Sign in once', fil: 'Mag-sign in nang isang beses' },
        text: { en: 'You stay signed in until you press Log out on that phone.', fil: 'Mananatili kang naka-sign in hanggang pindutin mo ang Log out sa phone na iyon.' } },
    ],
  },
  {
    id: 'notifications', for: 'member',
    title: { en: 'Turn on notifications', fil: 'I-on ang notifications' },
    blurb: { en: 'Bookings, payments, coach notes and messages on your phone, even with the app closed.', fil: 'Bookings, bayad, notes ng coach at mensahe sa phone mo, kahit sarado ang app.' },
    steps: [
      { scene: { k: 'phone', screen: 'notify' },
        title: { en: 'Press Turn on', fil: 'Pindutin ang Turn on' },
        text: { en: 'On Today, the Turn on notifications card — or Settings → Notifications.', fil: 'Sa Today, ang Turn on notifications card — o Settings → Notifications.' } },
      { scene: { k: 'phone', screen: 'allow' },
        title: { en: 'Allow them', fil: 'Payagan' },
        text: { en: 'When the phone asks, press Allow. Everything still lands in the bell either way.', fil: 'Kapag nagtanong ang phone, pindutin ang Allow. Lalabas pa rin lahat sa bell kahit ano ang piliin.' } },
      { scene: { k: 'toggle', label: 'Pop on screen' },
        title: { en: 'Android: let them pop on screen', fil: 'Android: hayaang lumabas sa screen' },
        text: { en: 'Phone Settings → Apps → Core Fitness → Notifications → turn on Pop on screen, so they show over other apps.', fil: 'Settings ng phone → Apps → Core Fitness → Notifications → i-on ang Pop on screen, para lumabas kahit nasa ibang app ka.' } },
    ],
  },
];

export const guideById = (id: string): Guide | undefined => GUIDES.find((g) => g.id === id);
