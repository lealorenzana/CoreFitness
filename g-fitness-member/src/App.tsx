import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import { syncUserCache } from './utils/auth';
import Layout from './components/layout/Layout';
import TrainerLayout from './components/layout/TrainerLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Home from './pages/Home';
import Workouts from './pages/Workouts';
import PlanBuilder from './pages/PlanBuilder';
import WorkoutTracker from './pages/WorkoutTracker';
import Rewards from './pages/Rewards';
import Challenges from './pages/Challenges';
import ProgressHub from './pages/progress/ProgressHub';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import ChangePassword from './pages/ChangePassword';
import ChangeEmail from './pages/ChangeEmail';
import ChatbotPage from './pages/ChatbotPage';
import Events from './pages/Events';
import PaymentHistory from './pages/PaymentHistory';
import RenewMembership from './pages/RenewMembership';
import EditProfile from './pages/EditProfile';
import AttendanceHistory from './pages/AttendanceHistory';
import BookClass from './pages/BookClass';
import BookingHistory from './pages/BookingHistory';
import TrainerProfilePage from './pages/TrainerProfile';
import Trainers from './pages/Trainers';
import TrainerHome from './pages/trainer/TrainerHome';
import TrainerMembers from './pages/trainer/TrainerMembers';
import TrainerSchedule from './pages/trainer/TrainerSchedule';
import TrainerAvailability from './pages/trainer/TrainerAvailability';
import TrainerSettings from './pages/trainer/TrainerSettings';
import TrainerBookings from './pages/trainer/TrainerBookings';
import TrainerProfile from './pages/trainer/TrainerProfile';
import TrainerEditProfile from './pages/trainer/TrainerEditProfile';
import TrainerChatbot from './pages/trainer/TrainerChatbot';
import Achievements from './pages/Achievements';
import NotificationsAll from './pages/NotificationsAll';
import GymPlan from './pages/GymPlan';


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
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', session.user.id)
        .single();
      if (active) {
        setStatus(profile?.role === role && profile?.status === 'active' ? 'authorized' : 'unauthorized');
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
  const [dest, setDest] = useState<'member' | 'trainer' | null>(null);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', session.user.id)
        .single();
      if (active && profile?.status === 'active') {
        setDest(profile.role === 'trainer' ? 'trainer' : 'member');
      }
    }

    checkSession();
    return () => {
      active = false;
    };
  }, []);

  if (dest === 'trainer') return <Navigate to="/trainer/home" replace />;
  if (dest === 'member') return <Navigate to="/member/home" replace />;

  return <Login />;
}

function App() {
  return (
    <BrowserRouter>
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
          <Route path="chatbot" element={<TrainerChatbot />} />
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
          {/* There is one membership screen, not two. `/member/membership` was a
              fully hardcoded page — "Premium · Dec 31 2024 · 15 days" and plans
              at ₱800/₱1,500 that exist nowhere in the database — and it
              contradicted Home, which reads the real membership. Redirected
              rather than deleted so older links and notification action_urls
              still land somewhere sensible. */}
          <Route path="membership" element={<Navigate to="/member/renew-membership" replace />} />
          <Route path="workouts" element={<Workouts />} />
          <Route path="plan" element={<PlanBuilder />} />
          <Route path="track" element={<WorkoutTracker />} />
          <Route path="rewards" element={<Rewards />} />
          <Route path="challenges" element={<Challenges />} />
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
          <Route path="renew-membership" element={<RenewMembership />} />
          <Route path="attendance-history" element={<AttendanceHistory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
