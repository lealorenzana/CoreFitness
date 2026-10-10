/**
 * The three documents between Core Fitness and a gym.
 *
 *   terms    — Terms of Service for gyms: the plan, billing, the lock, leaving.
 *   dpa      — the Data Processing Agreement: under RA 10173 the gym is the
 *              personal information controller of its members' data and Core
 *              Fitness the processor. The site has always said so ("You are the
 *              data controller; we only process it for you"); this is the paper.
 *   privacy  — the platform's own Privacy Policy: what Core Fitness itself
 *              controls (applications, owner and staff accounts, billing,
 *              support, this website). Members are covered by the member app's
 *              policy, which the gym is responsible for.
 *
 * Copy is a claim. Every clause describes something that runs, and names it in
 * the comment beside it; the numbers a setting decides (grace period, reminder
 * days, the business's name and contact) come from `platform_public_terms()`
 * (0154), never typed here. Where a clause is a promise the system cannot
 * enforce — liability, notice of changes, a breach — it is written as one, and
 * it is exactly the kind of clause a lawyer should read before a gym signs.
 *
 * ---- VERSIONS ----------------------------------------------------------------------
 *
 * `VERSION` is the date printed at the top of all three. An applicant who agrees
 * stores this string (accept_gym_terms, 0154), so changing a word means changing
 * the date — the old text stays in git history under the old one.
 *
 * **Whether they are in effect is not decided here.** The platform owner
 * publishes a version from the platform app's Settings (0156,
 * `platform_billing.gym_terms_published`), and this text is in effect only when
 * that published version *is* this VERSION — see `inEffect()`. Until then every
 * document says "Draft — not yet in effect" and the apply form does not ask
 * anybody to agree: agreeing to a draft records nothing true. A site deployed
 * with newer, unpublished wording therefore calls *that wording* a draft.
 */
export const VERSION = '2026-10-11';

export type DocKey = 'terms' | 'dpa' | 'privacy';

export interface Facts {
  businessName: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  graceDays: number | null;
  reminderDays: number[] | null;
  /** The version in effect (0156), or null: drafts, not read yet, or 0156 not pasted. */
  published: string | null;
}

/** This text is the one in effect. */
export const inEffect = (f: Facts) => f.published === VERSION;

export const FALLBACK_FACTS: Facts = {
  businessName: 'Core Fitness', address: null, email: null, phone: null, graceDays: null, reminderDays: null, published: null,
};

export interface DocSection { id: string; title: string; body: string | string[] }
export interface LegalDoc {
  key: DocKey;
  short: string;
  title: string;
  /** One line under the title. */
  lede: string;
  law: string;
  sections: DocSection[];
}

const list = (n: number[]) =>
  n.length === 1 ? `${n[0]}` : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;

const contactLine = (f: Facts) => {
  const ways = [f.email, f.phone].filter(Boolean).join(' or ');
  return ways
    ? `Write to ${f.businessName} at ${ways}${f.address ? `, or by post to ${f.address}` : ''}.`
    : `Write to ${f.businessName} through the support page in your gym app, or reply on your application's status link.`;
};

export function buildDocs(f: Facts): Record<DocKey, LegalDoc> {
  const grace = f.graceDays === null ? 'the grace period shown in your gym app' : `${f.graceDays} days`;
  const reminders = f.reminderDays && f.reminderDays.length
    ? `${list([...f.reminderDays].sort((a, b) => b - a))} days before`
    : 'before';

  return {
    terms: {
      key: 'terms', short: 'Terms for gyms', title: 'Terms of Service for gyms', law: 'Philippine law',
      lede: `The agreement between ${f.businessName} and a gym that uses it: what you get, how you pay, and what happens when you stop.`,
      sections: [
        { id: 'parties', title: '1. Who this is between', body: [
          `These terms are between ${f.businessName} ("Core Fitness", "we"), which runs the Core Fitness service, and the gym that applies for it or uses it ("you").`,
          'The person who applies, or who signs in as the gym\'s owner, confirms they are allowed to agree to this for the gym.',
          'Your members agree to the member Terms and Privacy Policy in the member app. Their relationship is with your gym, not with us — see the Data Processing Agreement for our part in it.',
        ] },
        { id: 'service', title: '2. The service', body: [
          'A gym app for you and your front desk, a phone app for your members and coaches, and — if you choose to be listed — a place on this website.',
          'What your gym can use depends on its plan, listed under Pricing on this site. You can switch off any part your gym does not run; your members then stop seeing it.',
          'Your gym keeps its own name, logo, colours, prices, refund tiers, freeze limits and waiver. They are yours to set, and the member app shows members what you set.',
        ] },
        { id: 'joining', title: '3. Applying and getting started', body: [
          'You apply on this website and make an account with your email and a password. You also get a private link to your application. We read every application ourselves and answer there, and by email when we can.',
          'Before we approve a gym we check six documents you upload: your Mayor\'s or business permit, DTI or SEC registration, BIR Certificate of Registration (2303), barangay business clearance, the owner\'s valid government ID, and a photo of the gym\'s front. We tell you which we verified, and why we could not accept one.',
          'We may decline an application, and you may call yours off. Either way it is shown to you, and you may ask us to delete the account you made: we then delete it and your documents.',
          'When we approve it, the account you made becomes the gym\'s owner account. You then set the gym up in the gym app, and send a renewed permit each January and any document before it runs out.',
        ] },
        { id: 'payment', title: '4. Plans, trials and paying', body: [
          'Prices are in Philippine pesos and are the ones on this site\'s Pricing section, which reads the same records your gym is billed from.',
          'You pay by the GCash, Maya or bank details shown in your gym app. Send us the reference number and a screenshot from Your plan → Pay Core Fitness; we check it and issue a receipt numbered CF-<year>-<number>. A reference can be claimed once.',
          'Each plan includes a number of AI coach messages a month. More can be bought as prepaid top-ups at the price shown in your gym app; they are used only after the month\'s messages run out and do not expire. You are told at 80% and when they run out, and nothing is charged that you did not buy.',
          'If your plan includes a free trial and your gym has never paid, your access runs until the trial ends. After that it follows the same rule as any payment date.',
          `Your gym's owners are reminded in the gym app ${reminders} the date your current period ends.`,
        ] },
        { id: 'late', title: '5. If a payment is late', body: [
          `After your paid-until date there is a grace period of ${grace}. Nothing changes during it.`,
          'After the grace period the gym becomes read-only: everything can still be seen, but nothing new is recorded — no check-ins, bookings or payments — until a payment is verified.',
          'Paying is always possible while read-only. The moment we verify it, your gym is writable again.',
        ] },
        { id: 'ending', title: '6. Suspension, and leaving', body: [
          'We suspend a gym only with a reason, and your owners are told what it is. A suspended gym is read-only.',
          'You can leave at any time by telling us. A gym that has left becomes read-only and stops appearing on this site.',
          'If you leave part-way through a paid period, tell us; a refund of the unused part is agreed with you in writing.',
          'What happens to your gym\'s records when you leave is set out in the Data Processing Agreement, section 9.',
        ] },
        { id: 'data', title: '7. Your members\' data', body: [
          'You are the personal information controller of your members\', coaches\' and staff\'s data; we process it for you. The Data Processing Agreement is part of these terms and wins if the two ever disagree about data.',
          'We look at your gym\'s records only in the ways that agreement lists. Everything else we see about your gym is counts — how many members, check-ins and bookings — never who.',
        ] },
        { id: 'yours', title: '8. What is yours to do', body: [
          'Put your gym\'s own contact details in the gym app. The member Terms and Privacy Policy show them to your members, and a member with a complaint needs a way to reach you.',
          'Keep the rules you set — prices, refund tiers, freeze limits, your waiver — the way you mean them. Members are shown exactly what you set.',
          'Give staff accounts only to people who should have them, and archive an account when someone leaves.',
          'Your gym\'s own legal duties stay yours: business permits, the Consumer Act towards your members, waivers, and registering with the National Privacy Commission where the law requires it.',
          'Members pay your gym, not us. We never handle your members\' money.',
        ] },
        { id: 'use', title: '9. Fair use', body: [
          'Do not use the service for anything unlawful, or to try to reach another gym\'s data.',
          'Upload only photos, logos and content you have the right to use.',
          'Do not resell the service or give another business access to it.',
        ] },
        { id: 'availability', title: '10. Keeping it running', body: [
          'The service runs on hosted providers, listed in the Data Processing Agreement. We work to keep it available and back up the database every week, but we cannot promise it will never be interrupted.',
          'When we plan work that affects you, we say so in the gym app first.',
        ] },
        { id: 'liability', title: '11. Limits of liability', body:
          'To the extent Philippine law allows, our total liability to you for any claim is limited to what your gym paid us in the twelve months before it. Nothing here limits liability that the law does not allow to be limited.' },
        { id: 'changes', title: '12. Changes to these terms', body: [
          'Each version is dated at the top. When we change these terms we announce it in the gym app before the new version takes effect.',
          'If you do not accept a new version, you can leave under section 6 before it takes effect.',
        ] },
        { id: 'contact', title: '13. Law and contact', body: [
          'These terms are governed by the laws of the Philippines.',
          contactLine(f),
        ] },
      ],
    },

    dpa: {
      key: 'dpa', short: 'Data Processing', title: 'Data Processing Agreement', law: 'RA 10173',
      lede: 'Your gym controls its members\' data. We process it for you, only to run the service — and this says exactly how.',
      sections: [
        { id: 'roles', title: '1. Who is who', body: [
          'Under the Data Privacy Act of 2012 (RA 10173) and its rules, your gym is the personal information controller of the data about its members, coaches and staff, and Core Fitness is its personal information processor.',
          'This agreement is part of the Terms of Service for gyms and wins over them on anything about personal data.',
        ] },
        { id: 'what', title: '2. What we process', body: [
          'Identity and contact details, emergency contacts, memberships and the payments your desk records — with the reference numbers and screenshots members send when they pay you online — check-ins, bookings and coaching sessions.',
          'What members choose to log for themselves: workouts, measurements, goals, progress photos, and messages with their coaches.',
          'Answers to the health questionnaire that comes with your waiver. These are sensitive personal information and are shown only to your owners and front desk — never to coaches.',
        ] },
        { id: 'instructions', title: '3. Only on your instructions', body: [
          'We process this data only to run the service as your gym configures it.',
          'We do not sell it, use it for advertising, or build profiles of your members for our own purposes.',
          'We never contact your members. The service talks to gyms; your members hear from your gym.',
        ] },
        { id: 'access', title: '4. When we look at your records', body: [
          'Support access: only when your owner grants it in the gym app, for between 1 and 24 hours, and it can be ended early. It is logged.',
          'A copy of your business records — people, memberships and payments, attendance, bookings, classes, events, coaching sessions, the shop, points and rewards — only while support access is granted or after your gym has left. Never chat, progress photos, the assistant, health answers, body data, workouts, invitations or credentials. Each copy is logged and your owners are told the same day.',
          'Otherwise we see counts only, such as how many check-ins your gym had, to run and bill the service.',
        ] },
        { id: 'security', title: '5. How it is protected', body: [
          'Each gym\'s records are separated in the database itself: a request from one gym cannot return another gym\'s rows, whatever screen asks.',
          'Everything travels over HTTPS. Passwords are never stored by us — the sign-in service holds them hashed.',
          'Tables that can hold a credential, such as invitation tokens or sent messages, have no read access for anyone in a gym.',
          'The database is copied every week, encrypted before it leaves, and each copy is kept for 90 days.',
          'Access to the platform\'s own tools is limited to the people who run Core Fitness.',
        ] },
        { id: 'subprocessors', title: '6. The services we use', body: [
          'Supabase — the database, sign-in and file storage (Singapore region).',
          'Vercel — serves the apps and this website.',
          'GitHub — holds the encrypted weekly backups.',
          'Anthropic — answers questions sent to the AI coach, only at gyms whose plan includes it and only for members who agree to it in the app.',
          'Resend — sends account emails such as an owner\'s first password, when email is switched on.',
          'Your members\' phone or browser maker (Google, Apple, Mozilla) — delivers notifications to members who turn them on.',
          'We will tell you in the gym app before adding a service that processes your members\' data.',
        ] },
        { id: 'breach', title: '7. If something goes wrong', body: [
          'If we learn of a breach affecting your gym\'s data, we tell your owners without undue delay, with what we know, so you can meet your own duty to notify the National Privacy Commission within 72 hours.',
          'We keep a record of what happened and what we did about it, and share it with you.',
        ] },
        { id: 'requests', title: '8. Helping with members\' requests', body: [
          'Members can download a copy of everything held about them (Settings → Your data) and correct most details themselves. Your desk can give them the same file.',
          'For anything else a member asks under RA 10173, we help your gym answer it.',
        ] },
        { id: 'retention', title: '9. When your gym leaves', body: [
          'Your gym\'s records stay, read-only. On request we give you a copy of your business records as in section 4.',
          'If you ask us in writing to delete your gym\'s records, we do so and confirm it in writing, except what the law requires us to keep. Copies in backups age out within 90 days.',
        ] },
        { id: 'transfer', title: '10. Where data is processed', body:
          'The database is hosted in Singapore. Some of the services in section 6 may process data elsewhere; we use them only for the purpose listed there.' },
        { id: 'contact', title: '11. Contact', body: contactLine(f) },
      ],
    },

    privacy: {
      key: 'privacy', short: 'Privacy', title: 'Privacy Policy', law: 'RA 10173',
      lede: `What ${f.businessName} itself holds — about gyms that apply, the people who run them, and visitors to this site.`,
      sections: [
        { id: 'scope', title: '1. What this covers', body: [
          `This policy covers personal data that ${f.businessName} controls: applications, the accounts of gym owners and staff, billing, support, and this website.`,
          'If you are a member or a coach at a gym, your gym controls your data. Its Privacy Policy is in the member app, and we process your data only for your gym, under the Data Processing Agreement.',
        ] },
        { id: 'collect', title: '2. What we hold', body: [
          'From an application: the gym\'s name and address, your name, email and phone, roughly how many members you have, the plan you chose, how you heard of us, how you prefer to be contacted, and the messages on your application.',
          'The business documents you upload to be verified (permit, DTI or SEC registration, BIR 2303, barangay clearance, a photo of the gym\'s front and the owner\'s government ID), in private storage only you and the people who run Core Fitness can open, with what we decided about each.',
          'For owners and staff: name, email, phone and role. Your password is held, hashed, by the sign-in service — never by us.',
          'For billing: your plan, the references and screenshots you send for payments, and the receipts we issue.',
          'Support tickets, and a copy of each email we send, so we can show it was sent.',
          'What you tell us from the gym app: ratings, ideas and problem reports (with a screenshot if you add one, kept private to your gym and us), and a testimonial — shown on this website only after we approve it, with the name you chose, and removed the moment you take it down.',
          'A log of actions taken in the gym and platform apps, such as a plan change or a support session.',
          'Counts of how much each gym uses each feature — never who did what.',
        ] },
        { id: 'website', title: '3. This website', body: [
          'No analytics, no advertising and no tracking scripts. We set no cookies.',
          'The typeface is loaded from Google Fonts, so your browser asks Google for it.',
          'The prices and the list of gyms are read from our database each time the page opens.',
        ] },
        { id: 'why', title: '4. Why we hold it', body: [
          'To answer applications, run and bill the service, and help you when you ask.',
          'To keep financial records the law expects, and logs that let us look into problems and misuse.',
        ] },
        { id: 'who', title: '5. Who sees it', body: [
          'The people who run Core Fitness, and the services listed in the Data Processing Agreement, section 6, for the purpose listed there.',
          'We do not sell, rent or trade it.',
        ] },
        { id: 'kept', title: '6. How long it is kept', body: [
          'Applications, approved or not, are kept as the record of what was asked and answered.',
          'If we decline an application or you call it off, we delete your account and your documents when you ask; the application itself stays as the record. Documents of an approved gym are kept while it uses the service.',
          'Billing records are kept as long as the law requires financial records to be kept.',
          'Owner and staff accounts are kept while the gym uses the service, and archived — not erased — after, so the gym\'s history still makes sense.',
        ] },
        { id: 'rights', title: '7. Your rights under RA 10173', body: [
          'Ask what we hold about you, have it corrected, object to how it is used, and ask for it to be deleted where the law allows.',
          'Complain to the National Privacy Commission if you think we have got this wrong.',
          contactLine(f),
        ] },
        { id: 'changes', title: '8. Changes', body:
          'This policy is dated at the top. If it changes in a way that matters, gyms are told in the gym app, and the date changes with it.' },
      ],
    },
  };
}

export const DOC_ORDER: DocKey[] = ['terms', 'dpa', 'privacy'];
