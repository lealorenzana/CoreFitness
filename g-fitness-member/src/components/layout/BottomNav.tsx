import { NavLink } from 'react-router-dom';
import { Home, MessageSquare, Calendar, Dumbbell, User } from 'lucide-react';

const navItems = [
  { label: 'Home', path: '/member/home', icon: Home },
  { label: 'Chat', path: '/member/chatbot', icon: MessageSquare },
  { label: 'Events', path: '/member/events', icon: Calendar },
  { label: 'Trainers', path: '/member/trainers', icon: Dumbbell },
  { label: 'Profile', path: '/member/profile', icon: User },
];

export default function BottomNav() {
  return (
    <nav className="bg-black border-t-2 border-gray-800 shadow-2xl z-40">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 relative ${
                  isActive
                    ? 'text-primary-start'
                    : 'text-gray-500 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-start to-primary-end rounded-b-full" />
                  )}
                  <Icon size={22} className={`${isActive ? 'scale-110' : ''} transition-transform`} />
                  <span className="text-[10px] mt-1 font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
