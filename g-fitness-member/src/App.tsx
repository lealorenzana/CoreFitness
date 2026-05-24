import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import TrainerLayout from './components/layout/TrainerLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import GymList from './pages/GymList';
import GymDetail from './pages/GymDetail';
import Home from './pages/Home';
import Membership from './pages/Membership';
import Workouts from './pages/Workouts';
import ProgressHub from './pages/progress/ProgressHub';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import ChangePassword from './pages/ChangePassword';
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
import TrainerBookings from './pages/trainer/TrainerBookings';
import TrainerProfile from './pages/trainer/TrainerProfile';
import { getSelectedGym } from './utils/prototype';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const selectedGym = getSelectedGym();

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (!selectedGym) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function LoginRoute() {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const selectedGym = getSelectedGym();
  const trainerMode = localStorage.getItem('trainerMode') === 'true';

  if (isLoggedIn && selectedGym) {
    return <Navigate to={trainerMode ? '/trainer/home' : '/member/home'} replace />;
  }

  if (!selectedGym) {
    return <Navigate to="/" replace />;
  }

  return <Login />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing: Browse Gyms first */}
        <Route path="/" element={<GymList />} />
        <Route path="/gyms" element={<Navigate to="/" replace />} />
        <Route path="/gym/:gymId" element={<GymDetail />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/register" element={<Register />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />

        {/* Trainer Role Route */}
        <Route path="/trainer" element={<TrainerLayout />}>
          <Route index element={<Navigate to="/trainer/home" replace />} />
          <Route path="home" element={<TrainerHome />} />
          <Route path="members" element={<TrainerMembers />} />
          <Route path="schedule" element={<TrainerSchedule />} />
          <Route path="bookings" element={<TrainerBookings />} />
          <Route path="profile" element={<TrainerProfile />} />
        </Route>

        {/* Protected Member Routes */}
        <Route
          path="/member"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="home" element={<Home />} />
          <Route path="chatbot" element={<ChatbotPage />} />
          <Route path="events" element={<Events />} />
          <Route path="trainers" element={<Trainers />} />
          <Route path="book-class" element={<BookClass />} />
          <Route path="booking-history" element={<BookingHistory />} />
          <Route path="trainer/:trainerId" element={<TrainerProfilePage />} />
          <Route path="membership" element={<Membership />} />
          <Route path="workouts" element={<Workouts />} />
          <Route path="progress" element={<ProgressHub />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/edit" element={<EditProfile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="change-password" element={<ChangePassword />} />
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
