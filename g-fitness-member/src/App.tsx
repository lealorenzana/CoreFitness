import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import GymList from './pages/GymList';
import GymDetail from './pages/GymDetail';
import Home from './pages/Home';
import Membership from './pages/Membership';
import Workouts from './pages/Workouts';
import Progress from './pages/Progress';
import Profile from './pages/Profile';
import ChatbotPage from './pages/ChatbotPage';
import Events from './pages/Events';
import PaymentHistory from './pages/PaymentHistory';
import RenewMembership from './pages/RenewMembership';
import EditProfile from './pages/EditProfile';
import AttendanceHistory from './pages/AttendanceHistory';
import BookClass from './pages/BookClass';
import BookingHistory from './pages/BookingHistory';
import TrainerProfile from './pages/TrainerProfile';

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  return isLoggedIn ? <>{children}</> : <Navigate to="/" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/gyms" element={<GymList />} />
        <Route path="/gym/:gymId" element={<GymDetail />} />

        {/* Protected Member Routes */}
        <Route path="/member" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route path="home" element={<Home />} />
          <Route path="chatbot" element={<ChatbotPage />} />
          <Route path="events" element={<Events />} />
          <Route path="book-class" element={<BookClass />} />
          <Route path="booking-history" element={<BookingHistory />} />
          <Route path="trainer/:trainerId" element={<TrainerProfile />} />
          <Route path="membership" element={<Membership />} />
          <Route path="workouts" element={<Workouts />} />
          <Route path="progress" element={<Progress />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/edit" element={<EditProfile />} />
          <Route path="payments" element={<PaymentHistory />} />
          <Route path="renew" element={<RenewMembership />} />
          <Route path="attendance-history" element={<AttendanceHistory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
