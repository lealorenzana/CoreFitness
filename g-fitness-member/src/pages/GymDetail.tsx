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
  Dumbbell,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';
import { setSelectedGym } from '../utils/prototype';

// Equipment images data
const GYM_EQUIPMENT: Record<string, string[]> = {
  'g-fitness': [
    '/g-fitness equipment.jpg',
    '/g-fitness equipment2.jpg',
    '/g-fitness equipment3.jpg',
  ],
  'fitness-regency': [
    '/fitness-regency-equiment1.jpg',
    '/fitness-regency-equiment2.jpg',
    '/fitness-regency-equiment3.jpg',
  ],
  'ferrer-fitness': [
    '/ferrer-fitness-cover.png',
    '/ferrer-fitness-logo.png',
  ],
};

// Google Maps coordinates (you can update these with actual coordinates)
const GYM_COORDINATES: Record<string, { lat: number; lng: number; address: string }> = {
  'g-fitness': {
    lat: 13.4167,
    lng: 120.6000,
    address: 'Brgy. Payompon, Mamburao (Beside OMECO Mamburao)',
  },
  'fitness-regency': {
    lat: 13.4170,
    lng: 120.6010,
    address: 'Mamburao, Occidental Mindoro',
  },
  'ferrer-fitness': {
    lat: 13.4165,
    lng: 120.5995,
    address: 'Mamburao, Occidental Mindoro',
  },
};

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

  const handleBackToGyms = () => {
    navigate('/', { 
      replace: true,
      state: { skipSplash: true, scrollToGymList: true }
    });
  };

  const isGFitness = gym.id === 'g-fitness';

  return (
    <MobileFrame>
      <div className="min-h-screen pb-8" style={{ backgroundColor: '#050400' }}>
        {/* Back Button */}
        <div className="px-4 pt-6 pb-8" style={{ backgroundColor: '#050400' }}>
          <button
            onClick={handleBackToGyms}
            className="flex items-center gap-2 text-white/40 hover:text-yellow-400 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Gyms
          </button>
        </div>

        <div className="px-4">

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
            
            {/* Embedded Google Map */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/60 text-sm font-semibold">View on Map</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(GYM_COORDINATES[gym.id]?.address || gym.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                >
                  Open in Google Maps
                  <ExternalLink size={12} />
                </a>
              </div>
              <div className="relative w-full h-48 rounded-xl overflow-hidden border border-yellow-500/20">
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  style={{ border: 0 }}
                  src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(GYM_COORDINATES[gym.id]?.address || gym.address)}&zoom=15`}
                  allowFullScreen
                  title={`${gym.name} Location`}
                />
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

          {/* Equipment & Facilities Section */}
          {GYM_EQUIPMENT[gym.id] && GYM_EQUIPMENT[gym.id].length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="glass-card rounded-2xl p-5 mb-5"
            >
              <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
                <Dumbbell size={20} className="text-yellow-400" />
                Equipment & Facilities
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {GYM_EQUIPMENT[gym.id].map((img, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-xl overflow-hidden border border-yellow-500/20 bg-black/40"
                  >
                    <img
                      src={img}
                      alt={`Equipment ${idx + 1}`}
                      className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
              <p className="text-white/40 text-xs mt-3 text-center">
                Tap images to view full size
              </p>
              <button
                className="w-full mt-3 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                See More
                <ChevronRight size={16} />
              </button>
            </motion.div>
          )}

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
