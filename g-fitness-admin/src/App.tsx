import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GymProvider } from './hooks/useGymContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLogin from './pages/AdminLogin';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import MemberDetail from './pages/MemberDetail';
import Attendance from './pages/Attendance';
import Analytics from './pages/Analytics';
import Retention from './pages/Retention';
import Revenue from './pages/Revenue';
import Payments from './pages/Payments';
import Trainers from './pages/Trainers';
import Chatbot from './pages/Chatbot';
import Settings from './pages/Settings';
import Schedule from './pages/Schedule';
import Bookings from './pages/Bookings';
import Events from './pages/Events';
import Notifications from './pages/Notifications';
import { Toaster } from './components/ui/sonner';

function App() {
  return (
    <GymProvider>
      <BrowserRouter>
        <Toaster />
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="members" element={<Members />} />
            <Route path="members/:memberId" element={<MemberDetail />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="retention" element={<Retention />} />
            <Route path="revenue" element={<Revenue />} />
            <Route path="payments" element={<Payments />} />
            <Route path="trainers" element={<Trainers />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="events" element={<Events />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="chatbot" element={<Chatbot />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
          <Route path="/admin/dashboard" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/admin/login" replace />} />
        </Routes>
      </BrowserRouter>
    </GymProvider>
  );
}

export default App;
