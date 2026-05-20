import { NavLink, useNavigate } from 'react-router-dom';
import Logo from '../brand/Logo';
import { motion } from 'framer-motion';
import { LayoutDashboard, Users, CheckSquare, TrendingUp, Target, DollarSign, CreditCard, Dumbbell, CalendarDays, Calendar, MessageSquare, Settings, LogOut } from 'lucide-react';
import { showToast } from '../../utils/toast';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Members', path: '/members', icon: Users },
  { label: 'Attendance', path: '/attendance', icon: CheckSquare },
  { label: 'Analytics', path: '/analytics', icon: TrendingUp },
  { label: 'Retention', path: '/retention', icon: Target },
  { label: 'Revenue', path: '/revenue', icon: DollarSign },
  { label: 'Payments', path: '/payments', icon: CreditCard },
  { label: 'Trainers', path: '/trainers', icon: Dumbbell },
  { label: 'Schedule', path: '/schedule', icon: CalendarDays },
  { label: 'Bookings', path: '/bookings', icon: Calendar },
  { label: 'Chatbot', path: '/chatbot', icon: MessageSquare },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function Sidebar() {
  const navigate = useNavigate();
  
  const handleLogout = () => {
    localStorage.removeItem('adminAuthenticated');
    localStorage.removeItem('adminUser');
    showToast('Logged out successfully', 'success');
    navigate('/admin/login');
  };
  
  return (
    <aside className="w-72 min-w-[288px] h-screen bg-dark-lighter border-r border-dark-border flex flex-col shadow-2xl flex-shrink-0 fixed left-0 top-0 z-50">
      {/* Logo Section */}
      <div className="p-6 border-b border-dark-border">
        <Logo size="md" showText={true} />
        <p className="text-xs text-gray-400 mt-3 font-medium tracking-wide">
          SMART FITNESS. SMARTER MANAGEMENT.
        </p>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-primary-start to-primary-end text-white shadow-lg shadow-primary-start/30'
                    : 'text-gray-400 hover:bg-dark-border/50 hover:text-white'
                }`
              }
              style={{
                outline: 'none',
                boxShadow: 'none',
                border: 'none'
              }}
            >
              <Icon size={20} className="group-hover:scale-110 transition-transform" />
              <span className="font-medium text-sm">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      
      {/* Footer */}
      <div className="p-4 border-t border-dark-border/50 space-y-3">
        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 text-gray-400 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/30 group"
        >
          <LogOut size={20} className="group-hover:scale-110 transition-transform" />
          <span className="font-medium text-sm">Logout</span>
        </button>
        
        {/* Version Info */}
        <div className="bg-dark-border/30 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 leading-relaxed">
            Powered by <span className="text-gradient font-semibold">G-Fitness CORE</span>
          </p>
          <p className="text-xs text-gray-600 mt-1">v1.0.0</p>
        </div>
      </div>
    </aside>
  );
}
