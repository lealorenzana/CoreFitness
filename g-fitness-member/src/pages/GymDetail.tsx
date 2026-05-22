import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { GYMS } from '../data/gyms';
import {
  MapPin,
  Clock,
  DollarSign,
  Users,
  ArrowLeft,
  Check,
  Mail,
  Phone,
  Sparkles,
} from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import { setSelectedGym } from '../utils/prototype';

export default function GymDetail() {
  const navigate = useNavigate();
  const { gymId } = useParams();
  const gym = GYMS.find((g) => g.id === gymId);

  if (!gym) {
    return (
      <MobileFrame>
        <div className="p-6 text-white text-center">Gym not found</div>
      </MobileFrame>
    );
  }

  const handleBecomeMember = () => {
    setSelectedGym(gym.id, gym.name);
    navigate('/login');
  };

  const isGFitness = gym.id === 'g-fitness';

  return (
    <MobileFrame>
      <div className="min-h-screen pb-8" style={{ backgroundColor: '#050400' }}>
        <div className="px-4 py-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-white/40 hover:text-yellow-400 transition-colors mb-4"
          >
            <ArrowLeft size={20} />
            Back to Gyms
          </button>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-3xl shadow-2xl mb-6"
          >
            <div className="relative h-52">
              <img src={gym.cover} alt={gym.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} />
              {gym.motivationalText && (
                <p className="absolute left-4 top-1/2 -translate-y-1/2 text-white/90 font-bebas text-2xl tracking-widest rotate-[-90deg] origin-left opacity-80">
                  {gym.motivationalText}
                </p>
              )}
              <div className="absolute bottom-4 left-4 right-4 flex items-end gap-4">
                <img
                  src={gym.logo}
                  alt={`${gym.name} logo`}
                  className="w-16 h-16 object-contain rounded-xl bg-white p-1 shadow-lg flex-shrink-0"
                />
                <div>
                  <h1 className="text-2xl font-orbitron font-bold text-white">
                    {isGFitness ? 'G-FITNESS GYM' : gym.name}
                  </h1>
                  <p className="text-yellow-300 text-sm font-semibold mt-1">{gym.tagline}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {isGFitness && gym.packages && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass-card rounded-2xl p-5 mb-5"
            >
              <h3 className="text-white font-semibold text-lg mb-1 flex items-center gap-2">
                <Sparkles className="text-yellow-400" size={20} />
                Membership Packages & Pricing
              </h3>
              <div className="space-y-3 mt-4">
                {gym.packages.map((pkg) => (
                  <div
                    key={pkg.tier}
                    className="bg-black/40 border border-yellow-500/10 rounded-xl p-4"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-yellow-400 text-xs font-semibold uppercase">{pkg.name}</p>
                        <p className="text-white font-bold text-lg">{pkg.tier}</p>
                      </div>
                      <p className="text-2xl font-bebas text-white">₱{pkg.price.toLocaleString()}</p>
                    </div>
                    <p className="text-white/40 text-sm">
                      <span className="text-white/35">Inclusions: </span>
                      {pkg.inclusions}
                    </p>
                  </div>
                ))}
                {gym.perSession && (
                  <div className="bg-black/40 border border-gray-700 rounded-xl p-4 flex justify-between items-center">
                    <span className="text-white font-semibold">Per Session</span>
                    <span className="text-yellow-400 font-bebas text-xl">₱{gym.perSession}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card rounded-2xl p-5 mb-5 space-y-4"
          >
            <h3 className="text-white font-semibold text-lg">Operating Hours</h3>
            <div className="flex items-start gap-3">
              <Clock size={20} className="text-yellow-400 mt-1" />
              <div>
                <p className="text-white/40 text-sm">Days</p>
                <p className="text-white font-medium">{gym.operatingDays}</p>
                <p className="text-white/40 text-sm mt-2">Hours</p>
                <p className="text-white font-medium">{gym.hours}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass-card rounded-2xl p-5 mb-5 space-y-4"
          >
            <h3 className="text-white font-semibold text-lg">Location & Contact</h3>
            <div className="flex items-start gap-3">
              <MapPin size={20} className="text-yellow-400 mt-1" />
              <div>
                <p className="text-white/40 text-sm">Address</p>
                <p className="text-white font-medium text-sm">{gym.address}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail size={20} className="text-yellow-400 mt-1" />
              <div>
                <p className="text-white/40 text-sm">Email</p>
                <p className="text-white font-medium text-sm">{gym.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone size={20} className="text-yellow-400 mt-1" />
              <div>
                <p className="text-white/40 text-sm">Contact Number</p>
                <p className="text-white font-medium">{gym.phone}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users size={20} className="text-yellow-400 mt-1" />
              <div>
                <p className="text-white/40 text-sm">Trainers</p>
                <p className="text-white font-medium">
                  {gym.hasTrainers ? 'Personal Trainers Available' : 'No Personal Trainers'}
                </p>
              </div>
            </div>
          </motion.div>

          {!isGFitness && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card rounded-2xl p-5 mb-5"
            >
              <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
                <DollarSign size={20} className="text-yellow-400" />
                Pricing
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between p-3 bg-black/40 rounded-xl">
                  <span className="text-white/60">Daily Rate</span>
                  <span className="text-yellow-400 font-bold">₱{gym.dailyRate}</span>
                </div>
                <div className="flex justify-between p-3 bg-black/40 rounded-xl">
                  <span className="text-white/60">Basic</span>
                  <span className="text-white font-bold">₱{gym.monthlyPlans.basic}/mo</span>
                </div>
                <div className="flex justify-between p-3 bg-black/40 rounded-xl">
                  <span className="text-white/60">Standard</span>
                  <span className="text-white font-bold">₱{gym.monthlyPlans.standard}/mo</span>
                </div>
                {gym.monthlyPlans.premium > 0 && (
                  <div className="flex justify-between p-3 bg-yellow-500/8 border border-yellow-500/20 rounded-xl">
                    <span className="text-white">Premium</span>
                    <span className="text-yellow-400 font-bold">₱{gym.monthlyPlans.premium}/mo</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass-card rounded-2xl p-5 mb-6"
          >
            <h3 className="text-white font-semibold text-lg mb-3">Amenities & Features</h3>
            <div className="space-y-2">
              {gym.amenities.map((amenity) => (
                <div key={amenity} className="flex items-center gap-3 p-3 bg-black/40 rounded-xl">
                  <Check size={18} className="text-violet" />
                  <span className="text-white/60 text-sm">{amenity}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <button
            onClick={handleBecomeMember}
            className="w-full py-3.5 rounded-xl font-bold transition-colors text-black"
            style={{ background: 'var(--color-secondary)' }}
          >
            Login / Become a Member
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}
