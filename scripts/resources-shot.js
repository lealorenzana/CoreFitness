async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const RESOURCES = [{"id": "wr0", "title": "Bodyweight workouts", "provider": "Darebee", "url": "https://darebee.com/workouts.html", "description": "Illustrated workouts you can do with no equipment. No account needed.", "category": "Bodyweight", "level": "all_levels", "sort_order": 10, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr5", "title": "The Recommended Routine", "provider": "r/bodyweightfitness", "url": "https://www.reddit.com/r/bodyweightfitness/wiki/kb/recommended_routine/", "description": "The best-known free bodyweight program. Three days a week, full progressions from zero, and a community that answers questions.", "category": "Beginner programs", "level": "beginner", "sort_order": 15, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr1", "title": "Full-length workout videos", "provider": "FitnessBlender", "url": "https://www.fitnessblender.com/videos", "description": "Filterable library of free follow-along videos by length, difficulty and equipment.", "category": "Follow-along", "level": "all_levels", "sort_order": 20, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr6", "title": "StrongLifts 5x5", "provider": "StrongLifts", "url": "https://stronglifts.com/5x5/", "description": "A simple barbell program for building strength: five exercises, three days a week, adding weight each session. Ask a coach to check your form first.", "category": "Strength programs", "level": "beginner", "sort_order": 25, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr2", "title": "Beginner bodyweight workout", "provider": "Nerd Fitness", "url": "https://www.nerdfitness.com/blog/beginner-body-weight-workout-burn-fat-build-muscle/", "description": "A gentle first routine with form guidance, aimed at people starting out.", "category": "Beginner programs", "level": "beginner", "sort_order": 30, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr3", "title": "Progression-based calisthenics", "provider": "Hybrid Calisthenics", "url": "https://www.hybridcalisthenics.com/routine", "description": "Step-by-step progressions that scale from very easy to very hard.", "category": "Bodyweight", "level": "all_levels", "sort_order": 40, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr4", "title": "Exercise directory", "provider": "ExRx.net", "url": "https://exrx.net/Lists/Directory", "description": "Reference library of exercises by muscle group, with form notes.", "category": "Reference", "level": "all_levels", "sort_order": 50, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr7", "title": "Yoga With Adriene", "provider": "YouTube", "url": "https://www.youtube.com/@yogawithadriene", "description": "Hundreds of free yoga sessions from 10 to 60 minutes, including several full beginner series. Good for rest days and stiff mornings.", "category": "Follow-along", "level": "all_levels", "sort_order": 60, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr8", "title": "HASfit full workouts", "provider": "YouTube", "url": "https://www.youtube.com/@HASfit", "description": "Free full-length workouts with a low-impact option shown alongside every movement — useful if something hurts or you are coming back from a break.", "category": "Follow-along", "level": "all_levels", "sort_order": 65, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr9", "title": "MadFit home workouts", "provider": "YouTube", "url": "https://www.youtube.com/@MadFit", "description": "Apartment-friendly workouts with no jumping and no equipment. Made for small spaces and thin floors.", "category": "Follow-along", "level": "beginner", "sort_order": 70, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr10", "title": "How much exercise do I need?", "provider": "World Health Organization", "url": "https://www.who.int/news-room/fact-sheets/detail/physical-activity", "description": "The actual weekly targets for adults, older adults and people with chronic conditions — from the WHO rather than from a gym trying to sell you sessions.", "category": "Guidance", "level": "all_levels", "sort_order": 90, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr11", "title": "Exercise and fitness guides", "provider": "NHS", "url": "https://www.nhs.uk/live-well/exercise/", "description": "Plain-language guides to getting started, staying safe and building up gradually, written for people who are not athletes.", "category": "Guidance", "level": "beginner", "sort_order": 95, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr12", "title": "ACE Exercise Library", "provider": "American Council on Exercise", "url": "https://www.acefitness.org/resources/everyone/exercise-library/", "description": "Step-by-step exercise instructions with photos, from a major trainer-certifying body. Search by body part or equipment.", "category": "Exercise libraries", "level": "all_levels", "sort_order": 100, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr13", "title": "NASM Exercise Library", "provider": "National Academy of Sports Medicine", "url": "https://www.nasm.org/resource-center/exercise-library", "description": "Exercise demonstrations and instructions from NASM, the organisation behind the CPT certificate many trainers hold.", "category": "Exercise libraries", "level": "all_levels", "sort_order": 101, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr14", "title": "MuscleWiki", "provider": "MuscleWiki", "url": "https://musclewiki.com/", "description": "Tap a muscle on an interactive body map to see exercises that train it, each with a short demonstration.", "category": "Exercise libraries", "level": "all_levels", "sort_order": 102, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr15", "title": "ExerciseLibrary.com", "provider": "ExerciseLibrary.com", "url": "https://www.exerciselibrary.com/", "description": "Step-by-step guides to individual exercises: set-up, movement and common mistakes.", "category": "Exercise libraries", "level": "all_levels", "sort_order": 103, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr16", "title": "VisualBody Workout Library", "provider": "VisualBody", "url": "https://visualbody.net/workout-library/", "description": "A free, ad-free web library of 100+ movements shown on a 3D anatomy model, so you can see which muscles are working.", "category": "Exercise libraries", "level": "all_levels", "sort_order": 104, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr17", "title": "RepDriver", "provider": "RepDriver", "url": "https://repdriver.com/", "description": "Free guided workouts and an exercise library with narrated, step-by-step instructions.", "category": "Exercise libraries", "level": "all_levels", "sort_order": 105, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr18", "title": "SBS Program Bundle", "provider": "Stronger by Science", "url": "https://www.strongerbyscience.com/program-bundle/", "description": "Six full 21-week programs, including strength, hypertrophy and novice options, for 3 to 6 training days a week. Free as a Google Sheets download; they ask for an email address.", "category": "Free workout programs", "level": "all_levels", "sort_order": 110, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr19", "title": "Boostcamp program library", "provider": "Boostcamp", "url": "https://www.boostcamp.app/programs", "description": "11,000+ free programs from well-known coaches (5/3/1, GZCLP, push/pull/legs and more). Browse on the web and follow them in the free app.", "category": "Free workout programs", "level": "all_levels", "sort_order": 111, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr20", "title": "28 Programs (squat, bench, deadlift)", "provider": "Stronger by Science", "url": "https://www.strongerbyscience.com/newsletter/", "description": "Greg Nuckols' 28 free single-lift templates by skill level and days per week. Sent as a spreadsheet when you join the free newsletter.", "category": "Free workout programs", "level": "intermediate", "sort_order": 112, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr21", "title": "StrengthLog training programs", "provider": "StrengthLog", "url": "https://www.strengthlog.com/training-programs/", "description": "100+ programs and workouts, from a first full-body routine to powerlifting, free to follow in the StrengthLog app.", "category": "Free workout programs", "level": "all_levels", "sort_order": 113, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr22", "title": "Fitstra free programs", "provider": "Fitstra", "url": "https://fitstra.com/workout-programs/", "description": "Free strength and hypertrophy programs, from a 2 to 3 day beginner plan to a 6-day split, each with core work and conditioning included.", "category": "Free workout programs", "level": "all_levels", "sort_order": 114, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr23", "title": "Iron Library", "provider": "Iron Library", "url": "https://www.ironlibrary.ca/programs", "description": "A searchable collection of free lifting programs you can filter by sport (powerlifting, bodybuilding, strongman) and by lift.", "category": "Free workout programs", "level": "intermediate", "sort_order": 115, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr24", "title": "Stronger by Science", "provider": "Stronger by Science", "url": "https://www.strongerbyscience.com/", "description": "Long, evidence-based articles on building strength and muscle, written by coaches who read the research.", "category": "Strength & hypertrophy education", "level": "all_levels", "sort_order": 120, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr25", "title": "NASM Resource Center", "provider": "National Academy of Sports Medicine", "url": "https://www.nasm.org/resource-center", "description": "Free articles, guides and tools on training, nutrition and recovery.", "category": "Strength & hypertrophy education", "level": "all_levels", "sort_order": 121, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr26", "title": "Strength training for beginners", "provider": "StrengthLog", "url": "https://www.strengthlog.com/strength-training-for-beginners/", "description": "A complete beginner's guide: how to start, how often to train, how to choose weights and how to keep progressing.", "category": "Strength & hypertrophy education", "level": "beginner", "sort_order": 122, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr27", "title": "Lift Vault", "provider": "Lift Vault", "url": "https://liftvault.com/programs/", "description": "A database of lifting programs as spreadsheets, organised by goal and by coach, each with a write-up of who it suits.", "category": "Strength & hypertrophy education", "level": "intermediate", "sort_order": 123, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr28", "title": "Stronger by Science articles", "provider": "Stronger by Science", "url": "https://www.strongerbyscience.com/articles/", "description": "The full article archive, including research reviews on training volume, frequency, rest times and more.", "category": "Research-based training", "level": "all_levels", "sort_order": 130, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr29", "title": "Examine", "provider": "Examine", "url": "https://examine.com/", "description": "Independent summaries of nutrition and supplement research, graded by strength of evidence. Worth reading before you buy any supplement.", "category": "Research-based training", "level": "all_levels", "sort_order": 131, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr30", "title": "NSCA", "provider": "National Strength and Conditioning Association", "url": "https://www.nsca.com/", "description": "The professional body behind the CSCS certification. Articles and position statements on strength and conditioning.", "category": "Research-based training", "level": "all_levels", "sort_order": 132, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr31", "title": "American College of Sports Medicine", "provider": "ACSM", "url": "https://acsm.org/", "description": "The organisation behind the exercise guidelines most gyms and doctors follow.", "category": "Research-based training", "level": "all_levels", "sort_order": 133, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr32", "title": "Boostcamp app", "provider": "Boostcamp", "url": "https://www.boostcamp.app/", "description": "A free workout tracker built around following programs: logging, rest timer and progress charts. A paid tier adds analytics; the core stays free.", "category": "Free workout apps", "level": "all_levels", "sort_order": 140, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr33", "title": "StrengthLog app", "provider": "StrengthLog", "url": "https://www.strengthlog.com/", "description": "A free, ad-free workout log with instructions for 300+ exercises. Premium is optional.", "category": "Free workout apps", "level": "all_levels", "sort_order": 141, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr34", "title": "TrainSmart", "provider": "Trainsmart", "url": "https://www.trainsmart.com/", "description": "A free training diary and plan app, strongest for running and endurance events. Syncs with Garmin, Polar and Strava; coaching is an optional subscription.", "category": "Free workout apps", "level": "all_levels", "sort_order": 142, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr35", "title": "LiftLab (Android)", "provider": "LiftLab", "url": "https://play.google.com/store/apps/details?id=com.liftlab.app", "description": "A free lifting tracker for building your own multi-week programs, with rep-range and RIR targets and progression rules.", "category": "Free workout apps", "level": "intermediate", "sort_order": 143, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}, {"id": "wr36", "title": "Free Exercise DB", "provider": "Free Exercise DB (GitHub)", "url": "https://github.com/yuhonas/free-exercise-db", "description": "An open, public-domain dataset of 800+ exercises in JSON with images, for anyone building their own fitness app. A developer resource, not a workout guide.", "category": "For developers", "level": "all_levels", "sort_order": 150, "is_active": true, "image_url": null, "created_at": "2026-09-01T00:00:00Z", "created_by": null}];
  const REF = 'ifwxtekyjgeljerslnzr';
  const KEY = `sb-${REF}-auth-token`;

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b64 = (o) => {
    const str = JSON.stringify(o);
    let bits = '', outStr = '';
    for (let i = 0; i < str.length; i++) bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    while (bits.length % 6) bits += '0';
    for (let i = 0; i < bits.length; i += 6) outStr += CHARS[parseInt(bits.slice(i, i + 6), 2)];
    return outStr;
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;

  const today = new Date();
  const iso = (d, h, m) => {
    const x = new Date(today); x.setDate(today.getDate() + d); x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const dstr = (d) => {
    const x = new Date(today); x.setDate(today.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };

  // ── Who is signed in is a parameter: the member pages and the trainer
  //    pages need different sessions, and re-planting mid-run is how you end
  //    up screenshotting one role's data under the other's chrome.
  const ROLE = 'member';  // flip to 'member' for the member-side shots
  const WHO = ROLE === 'trainer'
    ? { id: 't1', role: 'trainer', email: 'tere@corefitness.test' }
    : { id: 'm1', role: 'member', email: 'lea@corefitness.test' };

  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: WHO.id, role: 'authenticated', exp })}.sig`,
    refresh_token: 'r', token_type: 'bearer', expires_at: exp,
    user: { id: WHO.id, aud: 'authenticated', role: 'authenticated', email: WHO.email,
            app_metadata: {}, user_metadata: {} },
  };

  const MEMBER = { id: 'm1', first_name: 'Lea', last_name: 'Lorenzana', email: 'lea@corefitness.test',
    role: 'member', status: 'active', phone: '+639171112222', photo_url: null, created_at: iso(-120, 9, 0) };
  const MEMBER2 = { id: 'm2', first_name: 'Miguel', last_name: 'Santos', email: 'miguel@corefitness.test',
    role: 'member', status: 'active', phone: null, photo_url: null, created_at: iso(-80, 9, 0) };
  const T1 = { id: 't1', first_name: 'Tere', last_name: 'Bautista', email: 'tere@corefitness.test',
    role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-300, 9, 0) };
  const T2 = { id: 't2', first_name: 'Marco', last_name: 'Dela Cruz', email: 'marco@corefitness.test',
    role: 'trainer', status: 'active', phone: null, photo_url: null, created_at: iso(-200, 9, 0) };

  const PREMIUM = { id: 'p3', name: 'Premium', tier: 'premium', price: 1200, duration_days: 30,
    is_active: true, description: 'Everything', can_book_classes: true, can_book_pt: true,
    class_bookings_per_week: null, pt_sessions_per_month: 4 };

  // Two classes tomorrow: one the member has NOT booked, and one at the same
  // hour as an existing commitment so the clash marking is visible.
  const CLASSES = [
    { id: 'c1', name: 'Morning Yoga', trainer_id: 't1', level: 'all_levels', capacity: 12,
      location: 'Studio A', class_type: 'group', scheduled_at: iso(1, 6, 0),
      duration_minutes: 60, template_id: 'ct1', created_at: iso(-30, 9, 0) },
    { id: 'c2', name: 'Strength Basics', trainer_id: 't2', level: 'beginner', capacity: 8,
      location: 'Main Floor', class_type: 'group', scheduled_at: iso(1, 6, 30),
      duration_minutes: 45, template_id: 'ct2', created_at: iso(-30, 9, 0) },
    { id: 'c3', name: 'Evening HIIT', trainer_id: 't1', level: 'intermediate', capacity: 20,
      location: 'Studio B', class_type: 'group', scheduled_at: iso(2, 18, 0),
      duration_minutes: 90, template_id: 'ct3', created_at: iso(-30, 9, 0) },
  ];

  // The member is already in Morning Yoga at 06:00 tomorrow, so Strength Basics
  // at 06:30 must render as a clash rather than as bookable.
  const BOOKINGS = [
    { id: 'b1', member_id: 'm1', class_id: 'c1', status: 'approved', requested_at: iso(-2, 9, 0),
      approved_at: iso(-2, 10, 0), rejected_at: null, approved_by: 't1',
      decided_by: 't1', decided_by_role: 'trainer', decided_at: iso(-2, 10, 0), classes: CLASSES[0] },
    { id: 'b9', member_id: 'm2', class_id: 'c3', status: 'pending', requested_at: iso(-3, 9, 0),
      approved_at: null, rejected_at: null, approved_by: null,
      decided_by: null, decided_by_role: null, decided_at: null, classes: CLASSES[2] },
  ];

  const PT = [
    { id: 's1', trainer_id: 't1', member_id: 'm2', starts_at: iso(2, 10, 0), duration_minutes: 60,
      status: 'pending', notes: null, requested_at: iso(-4, 11, 0), approved_at: null,
      approved_by: null, decided_by: null, decided_by_role: null, decided_at: null,
      payment_id: null, created_at: iso(-4, 11, 0) },
  ];

  const TABLES = {
    profiles: [MEMBER, MEMBER2, T1, T2],
    member_profiles: [MEMBER, MEMBER2].map((m) => ({
      profile_id: m.id, gym_id: null, address: 'Mamburao', emergency_contact_name: null,
      emergency_contact_phone: null, emergency_contact_relationship: null,
      qr_code: `QR-${m.id}`, experience_level: 'beginner', date_of_birth: '1998-04-12',
      gender: 'female', interests: ['yoga'], onboarding_completed_at: iso(-100, 9, 0),
      created_at: iso(-120, 9, 0), profiles: m,
    })),
    trainer_profiles: [T1, T2].map((t) => ({
      profile_id: t.id, specialization: 'Strength & conditioning',
      bio: 'Ten years coaching members of every level in Mamburao.',
      availability: null, certifications: ['NASM-CPT', 'First Aid / CPR'], profiles: t,
    })),
    public_trainers: [T1, T2].map((t) => ({
      id: t.id, first_name: t.first_name, last_name: t.last_name, photo_url: null,
      specialization: 'Strength & conditioning',
      bio: 'Ten years coaching members of every level in Mamburao.',
      certifications: ['NASM-CPT', 'First Aid / CPR'],
    })),
    public_trainer_credentials: [
      { trainer_id: 't1', title: 'NASM Certified Personal Trainer', verified_on: iso(-60, 9, 0) },
      { trainer_id: 't1', title: 'First Aid / CPR', verified_on: iso(-120, 9, 0) },
    ],
    membership_plans: [PREMIUM],
    memberships: [{ id: 'ms1', member_id: 'm1', plan_id: 'p3', status: 'active',
      start_date: dstr(-20), expiry_date: dstr(10), never_expires: false, frozen_at: null,
      created_at: iso(-20, 9, 0), membership_plans: PREMIUM }],
    classes: CLASSES,
    class_availability: CLASSES.map((c) => ({ class_id: c.id, capacity: c.capacity, booked_count: 3 })),
    bookings: BOOKINGS,
    pt_sessions: PT,
    trainer_busy_slots: [],
    trainer_availability: [
      { id: 'av1', trainer_id: 't1', day_of_week: 1, start_time: '06:00', end_time: '18:00' },
      { id: 'av2', trainer_id: 't2', day_of_week: 1, start_time: '06:00', end_time: '18:00' },
    ],
    trainer_rating_summary: [{ trainer_id: 't1', average_stars: 4.7, rating_count: 6 }],
    notifications: [
      { id: 'n1', user_id: WHO.id, type: 'system', title: 'Holiday hours this weekend',
        message: 'The gym closes at 6pm on Saturday and Sunday.', action_url: null,
        metadata: null, read: false, created_at: iso(-1, 10, 0) },
      { id: 'n2', user_id: WHO.id, type: 'payment', title: 'Payment received',
        message: 'The gym has confirmed your payment of PHP 1,200.',
        action_url: '/member/payments', metadata: { dedupe: 'payment:pay1:paid' },
        read: false, created_at: iso(0, 9, 30) },
      { id: 'n3', user_id: WHO.id, type: 'booking', title: 'Your session is confirmed',
        message: 'Tere Bautista accepted your request for Thursday 10:00.',
        action_url: '/member/bookings', metadata: null, read: true, created_at: iso(-2, 10, 5) },
    ],
    events: [
      { id: 'e1', title: 'Summer Fitness Challenge Launch',
        description: 'Eight weeks, four checkpoints, and a shirt for everyone who finishes.',
        starts_at: iso(6, 8, 0), duration_minutes: 180, location: 'Main Floor', capacity: 40,
        cancelled: false, is_featured: true, fee: null, what_to_bring: 'Towel and water',
        who_is_it_for: 'Everyone, no experience needed', contact: 'Front desk',
        image_url: null, created_by: null, created_at: iso(-5, 9, 0) },
      { id: 'e2', title: 'Nutrition Talk with a Dietitian',
        description: 'Practical eating around training, for people who cook at home.',
        starts_at: iso(14, 18, 0), duration_minutes: 90, location: 'Studio B', capacity: 25,
        cancelled: false, is_featured: false, fee: 150, what_to_bring: null,
        who_is_it_for: 'Premium members', contact: 'Tere', image_url: null,
        created_by: null, created_at: iso(-3, 9, 0) },
    ],
    event_registrations: [],
    gym_settings: [{ id: true, gym_name: 'Core Fitness', address: 'Mamburao, Occidental Mindoro',
      phone: null, email: null, opening_time: '06:00', closing_time: '21:00', logo_url: null,
      short_name: 'CF', tagline: null, updated_at: iso(0, 9, 0), updated_by: null }],
    features: [], plan_features: [], point_ledger: [], attendance: [],
    body_measurements: [], fitness_goals: [], workout_logs: [], workout_sets: [],
    achievements: [], achievement_unlocks: [], challenges: [], challenge_participants: [],
    rewards: [], reward_redemptions: [], trainer_ratings: [], trainer_feedback: [],
    workout_resources: RESOURCES, notification_prefs: [], member_share_prefs: [],
    push_subscriptions: [], payments: [], gym_plans: [], assistant_chats: [],
  };

  const RPC = {
    member_commitments: [
      { source: 'class', ref_id: 'b1', starts_at: iso(1, 6, 0), ends_at: iso(1, 7, 0),
        label: 'Morning Yoga' },
    ],
    member_points_balance: 340,
    member_progression: [{ level: 3, points: 340, next_level_points: 500 }],
    my_trainer_ratings: [
      { stars: 5, comment: 'Really patient with beginners. Explained every movement.',
        period: dstr(-6).slice(0, 8) + '01', created_at: iso(-6, 9, 0) },
      { stars: 4, comment: 'Good session, would like more time on cool-down.',
        period: dstr(-40).slice(0, 8) + '01', created_at: iso(-40, 9, 0) },
    ],
    plan_allows: true,
    // The real shape from `my_features()`: key, label, description, enabled.
    // A Premium member has all six, which is what makes the unlocked screens
    // render rather than showing a FeatureLock.
    my_features: [
      { key: 'workout_tracker', label: 'Workout tracker',
        description: 'Record exercises, sets, reps and weight.', enabled: true },
      { key: 'plan_builder', label: 'AI workout plan',
        description: 'A training plan built around your days and your goal.', enabled: true },
      { key: 'ai_model', label: 'Smarter AI assistant',
        description: 'General fitness questions answered by an AI model.', enabled: true },
      { key: 'points_earn', label: 'Earn CORE Points',
        description: 'Collect points for checking in and logging workouts.', enabled: true },
      { key: 'points_redeem', label: 'Redeem CORE Points',
        description: 'Exchange your points for gym rewards.', enabled: true },
      { key: 'challenges', label: 'Gym challenges',
        description: 'Join gym challenges and earn points.', enabled: true },
    ],
    sync_my_achievements: 0,
  };

  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session]);

  await page.route(`**://${REF}.supabase.co/**`, async (route) => {
    const req = route.request();
    const afterHost = req.url().replace(/^https?:\/\/[^/]+/, '');
    const qi = afterHost.indexOf('?');
    const pathname = qi === -1 ? afterHost : afterHost.slice(0, qi);
    const query = qi === -1 ? '' : afterHost.slice(qi + 1);
    const params = query.split('&').filter(Boolean).map((kv) => {
      const eq = kv.indexOf('=');
      return eq === -1 ? [decodeURIComponent(kv), '']
        : [decodeURIComponent(kv.slice(0, eq)), decodeURIComponent(kv.slice(eq + 1))];
    });
    const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json',
      body: JSON.stringify(b), headers: { 'Content-Range': '0-0/1', 'Access-Control-Allow-Origin': '*' } });

    if (pathname.startsWith('/auth/v1/')) {
      if (pathname.includes('/user')) return json(session.user);
      return json({ ...session });
    }
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const fn = pathname.split('/rest/v1/rpc/')[1];
      return json(fn in RPC ? RPC[fn] : null);
    }
    if (pathname.startsWith('/rest/v1/')) {
      const table = pathname.split('/rest/v1/')[1];
      let rows = TABLES[table] ?? [];
      for (const [k, v] of params) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m && rows.length && k in rows[0]) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      if (req.method() !== 'GET') return json(wantsObject ? (rows[0] ?? {}) : rows.slice(0, 1));
      return json(wantsObject ? (rows[0] ?? null) : rows);
    }
    if (pathname.startsWith('/storage/')) return json({});
    if (pathname.startsWith('/functions/')) return json({});
    return json([]);
  });


  await page.setViewportSize({ width: 402, height: 880 });
  await page.goto('http://localhost:5173/member/workouts', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'shots/38-resources-all.png' });
  const chips = await page.evaluate(() => [...document.querySelectorAll('button')]
    .map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /\d$/.test(t)));
  // One of the new groups, to see its icon and cards.
  const pick = async (label, shot) => {
    const b = page.locator('button', { hasText: label }).first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(900); await page.screenshot({ path: `shots/${shot}.png` }); }
    const cards = await page.locator('a[href^="http"]').count();
    return { label, cards };
  };
  const research = await pick('Research', '39-resources-research');
  const programs = await pick('Free workout programs', '40-resources-programs');
  return JSON.stringify({ chips, research, programs }, null, 1);
}
