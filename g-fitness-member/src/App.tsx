import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import { syncUserCache } from './utils/auth';
import { getGymContext, homeFor, myGyms, usableGyms } from './lib/gymContext';
import { lazyPage } from './lib/lazyPage';
import { Suspense } from 'react';
import Layout from './components/layout/Layout';
import TrainerLayout from './components/layout/TrainerLayout';
import Login from './pages/Login';
const Register = lazyPage(() => import('./pages/Register'));
const Onboarding = lazyPage(() => import('./pages/Onboarding'));
const Terms = lazyPage(() => import('./pages/Terms'));
const Privacy = lazyPage(() => import('./pages/Privacy'));
import Home from './pages/Home';
const Workouts = lazyPage(() => import('./pages/Workouts'));
const PlanBuilder = lazyPage(() => import('./pages/PlanBuilder'));
const WorkoutTracker = lazyPage(() => import('./pages/WorkoutTracker'));
const Routines = lazyPage(() => import('./pages/Routines'));
const RoutineEditor = lazyPage(() => import('./pages/RoutineEditor'));
const GuidedWorkout = lazyPage(() => import('./pages/GuidedWorkout'));
const Rewards = lazyPage(() => import('./pages/Rewards'));
const Challenges = lazyPage(() => import('./pages/Challenges'));
const AccountActivity = lazyPage(() => import('./pages/AccountActivity'));
const MyEvaluations = lazyPage(() => import('./pages/MyEvaluations'));
const WorkoutHistory = lazyPage(() => import('./pages/WorkoutHistory'));
const VisitHistory = lazyPage(() => import('./pages/VisitHistory'));
const RewardRequests = lazyPage(() => import('./pages/RewardRequests'));
const ProgressHub = lazyPage(() => import('./pages/progress/ProgressHub'));
const Profile = lazyPage(() => import('./pages/Profile'));
const Settings = lazyPage(() => import('./pages/Settings'));
const ChangePassword = lazyPage(() => import('./pages/ChangePassword'));
const ChangeEmail = lazyPage(() => import('./pages/ChangeEmail'));
const ChatbotPage = lazyPage(() => import('./pages/ChatbotPage'));
const Events = lazyPage(() => import('./pages/Events'));
const PaymentHistory = lazyPage(() => import('./pages/PaymentHistory'));
const RenewMembership = lazyPage(() => import('./pages/RenewMembership'));
const PauseOrCancel = lazyPage(() => import('./pages/PauseOrCancel'));
const Waiver = lazyPage(() => import('./pages/Waiver'));
const EditProfile = lazyPage(() => import('./pages/EditProfile'));
const AttendanceHistory = lazyPage(() => import('./pages/AttendanceHistory'));
const BookClass = lazyPage(() => import('./pages/BookClass'));
const BookingHistory = lazyPage(() => import('./pages/BookingHistory'));
const TrainerProfilePage = lazyPage(() => import('./pages/TrainerProfile'));
const Trainers = lazyPage(() => import('./pages/Trainers'));
import TrainerHome from './pages/trainer/TrainerHome';
const TrainerMembers = lazyPage(() => import('./pages/trainer/TrainerMembers'));
const TrainerSchedule = lazyPage(() => import('./pages/trainer/TrainerSchedule'));
const TrainerAvailability = lazyPage(() => import('./pages/trainer/TrainerAvailability'));
const TrainerSettings = lazyPage(() => import('./pages/trainer/TrainerSettings'));
const TrainerBookings = lazyPage(() => import('./pages/trainer/TrainerBookings'));
const TrainerProfile = lazyPage(() => import('./pages/trainer/TrainerProfile'));
const TrainerEditProfile = lazyPage(() => import('./pages/trainer/TrainerEditProfile'));
const Achievements = lazyPage(() => import('./pages/Achievements'));
const NotificationsAll = lazyPage(() => import('./pages/NotificationsAll'));
const GymPlan = lazyPage(() => import('./pages/GymPlan'));
const MembershipHub = lazyPage(() => import('./pages/MembershipHub'));
const ChooseGym = lazyPage(() => import('./pages/ChooseGym'));
const JoinGym = lazyPage(() => import('./pages/JoinGym'));
const AcceptInvite = lazyPage(() => import('./pages/AcceptInvite'));


type RoleCheck = 'checking' | 'authorized' | 'unauthorized';

/** Gates a route to authenticated users whose real DB role+status match. */
function RoleProtectedRoute({
  role,
  redirectTo,
  children,
}: {
  role: 'member' | 'trainer';
  redirectTo: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<RoleCheck>('checking');

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (active) setStatus('unauthorized');
        return;
      }
      // The role is the one in *this gym* (lib/gymContext, 0104) — the same
      // person can be a member at one gym and a coach at another.
      const ctx = await getGymContext();
      if (active) {
        setStatus(ctx?.role === role && ctx.status === 'active' ? 'authorized' : 'unauthorized');
      }
      // The session survives app restarts, so `login()` — the only writer of the
      // legacy `localStorage['user']` cache — may not have run this launch.
      // Repair it before the pages that still read it synchronously mount.
      void syncUserCache();
    }

    checkAccess();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => checkAccess());
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [role]);

  if (status === 'checking') return null;
  if (status === 'unauthorized') return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const [dest, setDest] = useState<'member' | 'trainer' | 'choose' | null>(null);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const ctx = await getGymContext();
      if (!active) return;
      if (ctx?.status === 'active' && homeFor(ctx.role)) {
        setDest(ctx.role === 'trainer' ? 'trainer' : 'member');
        return;
      }
      // Signed in, but not into a gym they can use: if another gym is open to
      // them, that is a choice to make, not a sign-in to repeat.
      if (usableGyms(await myGyms()).length > 0 && active) setDest('choose');
    }

    checkSession();
    return () => {
      active = false;
    };
  }, []);

  if (dest === 'trainer') return <Navigate to="/trainer/home" replace />;
  if (dest === 'member') return <Navigate to="/member/home" replace />;
  if (dest === 'choose') return <Navigate to="/choose-gym" replace />;

  return <Login />;
}

function App() {
  return (
    <BrowserRouter>
      {/* Screens load when opened (lib/lazyPage.ts). The shells have their own
          boundary around <Outlet/>, so the tab bar stays put; this one covers
          the few screens outside a shell (sign-up, terms). */}
      <Suspense fallback={<div style={{ minHeight: '100dvh', background: 'var(--color-bg)' }} />}>
      <Routes>
        {/* `/` is the PWA `start_url`, so this is where the installed app opens
            and where signing out lands. It used to show a full-screen marketing
            splash ("Start your fitness journey" over a stock gym photo) with a
            Get Started button — an extra tap between a member and their app,
            every single launch, selling them something they had already bought.

            LoginRoute redirects an existing session straight to the right home
            screen, so this is: signed in → your app, signed out → sign in. */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/gyms" element={<Navigate to="/" replace />} />
        <Route path="/gym/:gymId" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<LoginRoute />} />
        {/* Which gym am I using, and joining another. Outside both shells: a
            person here has not picked a gym yet, so no tab bar applies. */}
        <Route path="/choose-gym" element={<ChooseGym />} />
        <Route path="/join" element={<JoinGym />} />
        <Route path="/join/:slug" element={<JoinGym />} />
        {/* An invitation from a gym (0111). Public on purpose: it is usually
            opened before the person has an account, and `peek_invitation`
            reveals only which gym invited them. Accepting still needs a
            session whose email matches the invitation. */}
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/register" element={<Register />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />

        {/* Trainer Role Route */}
        <Route
          path="/trainer"
          element={
            <RoleProtectedRoute role="trainer" redirectTo="/login">
              <TrainerLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/trainer/home" replace />} />
          <Route path="home" element={<TrainerHome />} />
          <Route path="members" element={<TrainerMembers />} />
          <Route path="schedule" element={<TrainerSchedule />} />
          {/* Sub-route of Schedule rather than a sixth nav tab — the bottom bar
              is full at five, and hours are something you set occasionally, not
              a destination you switch to. */}
          <Route path="availability" element={<TrainerAvailability />} />
          <Route path="bookings" element={<TrainerBookings />} />
          <Route path="profile" element={<TrainerProfile />} />
          <Route path="profile/edit" element={<TrainerEditProfile />} />
          <Route path="settings" element={<TrainerSettings />} />
          {/* Same component as the member route below — it reads the path to
              pick which catalogue to draw and which shell to return to. */}
          <Route path="achievements" element={<Achievements />} />
          <Route path="notifications" element={<NotificationsAll />} />
          {/* Same component as the member route. It reads the path to decide
              which shell to return to — sending a trainer to /member/settings
              drops them into a layout their role can't load. */}
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="change-email" element={<ChangeEmail />} />
          {/* Anything else under /trainer goes home rather than rendering the
              shell around nothing — see the member block below. */}
          <Route path="*" element={<Navigate to="/trainer/home" replace />} />
        </Route>

        {/* Protected Member Routes */}
        <Route
          path="/member"
          element={
            <RoleProtectedRoute role="member" redirectTo="/login">
              <Layout />
            </RoleProtectedRoute>
          }
        >
          <Route path="home" element={<Home />} />
          <Route path="chatbot" element={<ChatbotPage />} />
          <Route path="events" element={<Events />} />
          <Route path="trainers" element={<Trainers />} />
          <Route path="book-class" element={<BookClass />} />
          <Route path="booking-history" element={<BookingHistory />} />
          <Route path="trainer/:trainerId" element={<TrainerProfilePage />} />
          <Route path="trainer/:trainerId/evaluations" element={<MyEvaluations />} />
          {/* There is one membership screen, not two. `/member/membership` was a
              fully hardcoded page — "Premium · Dec 31 2024 · 15 days" and plans
              at ₱800/₱1,500 that exist nowhere in the database — and it
              contradicted Home, which reads the real membership. Redirected
              rather than deleted so older links and notification action_urls
              still land somewhere sensible. */}
          <Route path="workouts" element={<Workouts />} />
          <Route path="plan" element={<PlanBuilder />} />
          {/* Routines (0086): the list, the editor, and a routine run set by set.
              The free-form log stays at /track/log for a session with no routine. */}
          <Route path="track" element={<Routines />} />
          <Route path="track/log" element={<WorkoutTracker />} />
          <Route path="track/routine/:routineId" element={<RoutineEditor />} />
          <Route path="track/session/:logId" element={<GuidedWorkout />} />
          <Route path="rewards" element={<Rewards />} />
          <Route path="rewards/requests" element={<RewardRequests />} />
          <Route path="challenges" element={<Challenges />} />
          <Route path="challenges/completed" element={<Challenges completedOnly />} />
          <Route path="activity" element={<AccountActivity />} />
          <Route path="workout-history" element={<WorkoutHistory />} />
          <Route path="progress" element={<ProgressHub />} />
          <Route path="achievements" element={<Achievements />} />
          <Route path="notifications" element={<NotificationsAll />} />
          <Route path="gym-plan" element={<GymPlan />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/edit" element={<EditProfile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="change-email" element={<ChangeEmail />} />
          <Route path="payments" element={<PaymentHistory />} />
          <Route path="renew" element={<RenewMembership />} />
          {/* The Training tab opens Book a Session; this keeps the path alive. */}
          <Route path="training" element={<Navigate to="/member/book-class" replace />} />
          <Route path="membership" element={<MembershipHub />} />
          {/* Aliases for paths that exist only in notification rows.

              0030/0051-0055/0071 write `action_url` values that were never
              routes here: three notification types point at /member/bookings
              and one at /member/book. Before the catch-all they rendered a
              blank screen; with it they land on Home — so a member tapping
              "your session is confirmed" arrives somewhere that does not
              mention their session. Fixing the SQL would not help the rows
              already sitting in the table; an alias fixes both. */}
          <Route path="bookings" element={<Navigate to="/member/booking-history" replace />} />
          <Route path="book" element={<Navigate to="/member/book-class" replace />} />
          <Route path="renew-membership" element={<RenewMembership />} />
          {/* Asking the desk to pause or stop (0118). The screen asks; the desk
              still makes the change. */}
          <Route path="pause-or-cancel" element={<PauseOrCancel />} />
          {/* The gym's waiver and the PAR-Q (0119). */}
          <Route path="waiver" element={<Waiver />} />
          <Route path="attendance-history" element={<AttendanceHistory />} />
          <Route path="visits" element={<VisitHistory />} />
          {/* An unknown path under /member rendered the shell with an empty
              page in it — no error, no way to tell it apart from a screen that
              failed to load. A notification written before a route was renamed
              lands here, and so does every stale bookmark. Home instead. */}
          <Route path="*" element={<Navigate to="/member/home" replace />} />
        </Route>

        {/* Anything else at all. Login decides where to send them from there,
            because it is the one screen that knows whether anybody is signed
            in — a blank page was the old answer and it looked like a crash. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
