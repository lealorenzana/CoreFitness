import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { GYMS } from '../data/gyms';
import { MapPin, Clock, DollarSign, Users, ArrowLeft, Check, User } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';

export default function GymDetail() {
  const navigate = useNavigate();
  const { gymId } = useParams();
  const gym = GYMS.find(g => g.id === gymId);

  if (!gym) {
    return <div>Gym not found</div>;
  }

  return (
    <MobileFrame>
      <div className="px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            onClick={() => navigate('/gyms')}
            className="flex items-center gap-2 text-gray-400 hover:text-primary-start transition-colors mb-4"
          >
            <ArrowLeft size={20} />
            Back to Gyms
          </button>
        </motion.div>

        <div className="space-y-6 pb-6">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-3xl shadow-2xl"
          >
            <div className="relative h-48">
              <img src={gym.cover} alt={gym.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-4">
                <img src={gym.logo} alt={`${gym.name} logo`} className="w-16 h-16 object-contain rounded-xl bg-white p-2 shadow-lg" />
                <div>
                  <h1 className="text-2xl font-orbitron font-bold text-white">{gym.name}</h1>
                  <p className="text-white/80 text-sm mt-1">{gym.description}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-dark-lighter border border-dark-border rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-white font-semibold text-lg mb-4">Gym Information</h3>
            
            <div className="flex items-start gap-3">
              <User size={20} className="text-primary-start mt-1" />
              <div>
                <p className="text-gray-400 text-sm">Owner</p>
                <p className="text-white font-medium">{gym.owner}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin size={20} className="text-primary-start mt-1" />
              <div>
                <p className="text-gray-400 text-sm">Location</p>
                <p className="text-white font-medium">{gym.location}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock size={20} className="text-primary-start mt-1" />
              <div>
                <p className="text-gray-400 text-sm">Operating Hours</p>
                <p className="text-white font-medium">{gym.hours}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Users size={20} className="text-primary-start mt-1" />
              <div>
                <p className="text-gray-400 text-sm">Trainers</p>
                <p className="text-white font-medium">{gym.hasTrainers ? 'Personal Trainers Available' : 'No Personal Trainers'}</p>
              </div>
            </div>
          </motion.div>

          {/* Pricing */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-dark-lighter border border-dark-border rounded-2xl p-6"
          >
            <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
              <DollarSign size={20} className="text-primary-start" />
              Pricing
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-dark rounded-xl">
                <span className="text-gray-300">Daily Rate</span>
                <span className="text-primary-start font-bold text-lg">₱{gym.dailyRate}</span>
              </div>

              <div className="border-t border-dark-border pt-3">
                <p className="text-gray-400 text-sm mb-3">Monthly Plans</p>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-dark rounded-xl">
                    <span className="text-gray-300">Basic</span>
                    <span className="text-white font-bold">₱{gym.monthlyPlans.basic}/mo</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-dark rounded-xl">
                    <span className="text-gray-300">Standard</span>
                    <span className="text-white font-bold">₱{gym.monthlyPlans.standard}/mo</span>
                  </div>
                  {gym.monthlyPlans.premium > 0 && (
                    <div className="flex justify-between items-center p-3 bg-gradient-to-r from-primary-start/20 to-primary-end/20 border border-primary-start/30 rounded-xl">
                      <span className="text-white font-semibold">Premium</span>
                      <span className="text-primary-start font-bold">₱{gym.monthlyPlans.premium}/mo</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Amenities */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-dark-lighter border border-dark-border rounded-2xl p-6"
          >
            <h3 className="text-white font-semibold text-lg mb-4">Amenities & Features</h3>
            <div className="grid grid-cols-1 gap-2">
              {gym.amenities.map((amenity, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-dark rounded-xl">
                  <Check size={18} className="text-green-400" />
                  <span className="text-gray-300">{amenity}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <button
              onClick={() => navigate('/')}
              className="w-full py-4 bg-gradient-to-r from-primary-start to-primary-end text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-primary-start/30 transition-all duration-200"
            >
              Become a Member
            </button>
          </motion.div>
        </div>
      </div>
    </MobileFrame>
  );
}
