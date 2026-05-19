import { motion } from 'framer-motion';
import { useGymContext } from '../../hooks/useGymContext';
import { MapPin, Bell, ChevronDown, User } from 'lucide-react';

export default function Header() {
  const { selectedGym, setSelectedGym, gyms } = useGymContext();

  return (
    <header className="h-20 bg-dark-lighter/80 backdrop-blur-md border-b border-dark-border px-8 flex items-center justify-between shadow-lg sticky top-0 z-40">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center shadow-lg p-2">
          <img src="/logo.png" alt="Gym" className="w-full h-full object-contain" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white font-orbitron">
            {selectedGym.name}
          </h2>
          <p className="text-sm text-gray-400 flex items-center gap-1">
            <MapPin size={14} />
            {selectedGym.location}
          </p>
        </div>
      </motion.div>
      
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-6"
      >
        {/* Gym Switcher */}
        <div className="relative">
          <select
            value={selectedGym.id}
            onChange={(e) => {
              const gym = gyms.find(g => g.id === e.target.value);
              if (gym) setSelectedGym(gym);
            }}
            className="appearance-none px-6 py-3 pr-12 bg-dark border-2 border-dark-border rounded-xl text-white font-medium focus:outline-none focus:border-primary-start focus:ring-2 focus:ring-primary-start/20 transition-all duration-200 cursor-pointer hover:border-primary-start/50"
          >
            {gyms.map((gym) => (
              <option key={gym.id} value={gym.id}>
                {gym.name}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary-start">
            <ChevronDown size={16} />
          </div>
        </div>

        {/* Notifications */}
        <button className="relative p-3 rounded-xl bg-dark border border-dark-border hover:border-primary-start/50 hover:bg-dark-border transition-all duration-200 group">
          <Bell size={20} className="text-gray-400 group-hover:text-primary-start transition-colors" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-dark border border-dark-border hover:border-primary-start/50 transition-all duration-200 cursor-pointer group">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary-end flex items-center justify-center text-white shadow-lg">
            <User size={20} />
          </div>
          <div className="text-left">
            <p className="text-white font-medium text-sm group-hover:text-primary-start transition-colors">Admin</p>
            <p className="text-gray-400 text-xs">Super Admin</p>
          </div>
        </div>
      </motion.div>
    </header>
  );
}
