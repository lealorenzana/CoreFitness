import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, Award, Calendar, Clock, MapPin, CheckCircle } from 'lucide-react';
import { trainers } from '../data/trainers';

export default function TrainerProfile() {
  const navigate = useNavigate();
  const { trainerId } = useParams();

  // Find trainer by ID or name
  const trainer = trainers.find(
    t => t.id.toLowerCase() === trainerId?.toLowerCase() || 
         t.name.toLowerCase().includes(trainerId?.toLowerCase() || '')
  ) || trainers[0]; // Fallback to first trainer

  return (
    <div className="space-y-6 pb-4">
      {/* Header with Back Button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl bg-gray-800 border-2 border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:border-orange-500 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-orbitron font-bold text-white">Trainer Profile</h1>
        </div>
      </motion.div>

      {/* Trainer Header Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-orange-500/20 via-gray-900 to-gray-900 border-2 border-orange-500/30 rounded-3xl p-6 relative overflow-hidden"
      >
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-400/10 rounded-full blur-3xl"></div>

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Profile Picture */}
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center text-white font-bold text-4xl mb-4 shadow-lg">
            {trainer.name.split(' ')[1][0]}
          </div>

          {/* Name and Specialty */}
          <h2 className="text-2xl font-bold text-white mb-1">{trainer.name}</h2>
          <p className="text-orange-400 font-semibold mb-3">{trainer.specialty}</p>

          {/* Rating and Experience */}
          <div className="flex items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <Star size={20} className="text-yellow-400 fill-yellow-400" />
              <span className="text-white font-bold">{trainer.rating}</span>
              <span className="text-gray-400 text-sm">Rating</span>
            </div>
            <div className="w-px h-6 bg-gray-700"></div>
            <div className="flex items-center gap-2">
              <Award size={20} className="text-orange-400" />
              <span className="text-white font-bold">{trainer.experience}</span>
              <span className="text-gray-400 text-sm">Experience</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Bio Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gray-900 border-2 border-gray-800 rounded-2xl p-5"
      >
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span className="text-orange-400">📋</span>
          About
        </h3>
        <p className="text-gray-300 text-sm leading-relaxed">{trainer.bio}</p>
      </motion.div>

      {/* Certifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gray-900 border-2 border-gray-800 rounded-2xl p-5"
      >
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <Award size={20} className="text-orange-400" />
          Certifications
        </h3>
        <div className="space-y-2">
          {trainer.certifications.map((cert, index) => (
            <div key={index} className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-400" />
              <span className="text-gray-300 text-sm">{cert}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Availability Schedule */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gray-900 border-2 border-gray-800 rounded-2xl p-5"
      >
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Calendar size={20} className="text-orange-400" />
          Availability
        </h3>
        <div className="space-y-3">
          {trainer.availability.map((avail, index) => (
            <div key={index} className="bg-gray-800 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-semibold text-sm">{avail.day}</span>
                <span className="text-xs text-gray-400">{avail.slots.length} slots</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {avail.slots.map((slot, slotIndex) => (
                  <span
                    key={slotIndex}
                    className="px-2 py-1 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg text-xs font-medium"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Reviews Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gray-900 border-2 border-gray-800 rounded-2xl p-5"
      >
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Star size={20} className="text-orange-400" />
          Recent Reviews
        </h3>
        <div className="space-y-4">
          {/* Sample Reviews */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold">
                  JD
                </div>
                <span className="text-white text-sm font-semibold">John Doe</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={12} className="text-yellow-400 fill-yellow-400" />
                ))}
              </div>
            </div>
            <p className="text-gray-300 text-xs leading-relaxed">
              "Excellent trainer! Very knowledgeable and motivating. Helped me achieve my fitness goals in just 3 months."
            </p>
            <p className="text-gray-500 text-xs mt-2">2 weeks ago</p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold">
                  MS
                </div>
                <span className="text-white text-sm font-semibold">Maria Santos</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={12} className="text-yellow-400 fill-yellow-400" />
                ))}
              </div>
            </div>
            <p className="text-gray-300 text-xs leading-relaxed">
              "Best decision I made! Professional, patient, and really cares about your progress. Highly recommended!"
            </p>
            <p className="text-gray-500 text-xs mt-2">1 month ago</p>
          </div>
        </div>
      </motion.div>

      {/* Book Button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        onClick={() => navigate('/member/book-class')}
        className="w-full py-4 bg-gradient-to-r from-orange-500 to-orange-400 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all flex items-center justify-center gap-2"
      >
        <Calendar size={20} />
        Book Session with {trainer.name.split(' ')[1]}
      </motion.button>
    </div>
  );
}
