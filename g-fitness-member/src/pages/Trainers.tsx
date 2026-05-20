import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Star, Award, Calendar, ArrowRight } from 'lucide-react';
import { trainers } from '../data/trainers';

export default function Trainers() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 pb-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-orbitron font-bold bg-gradient-to-r from-orange-400 to-orange-300 bg-clip-text text-transparent">
          Our Trainers
        </h1>
        <p className="text-gray-400 mt-2">Expert coaches to guide your fitness journey</p>
      </motion.div>

      {/* Trainers Grid */}
      <div className="space-y-4">
        {trainers.map((trainer, index) => (
          <motion.div
            key={trainer.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => navigate(`/member/trainer/${trainer.id.toLowerCase()}`)}
            className="bg-gray-900 border-2 border-gray-800 rounded-2xl p-5 hover:border-orange-500 transition-all duration-200 cursor-pointer active:scale-98 shadow-lg"
          >
            <div className="flex items-start gap-4">
              {/* Trainer Avatar */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 shadow-lg">
                {trainer.name.split(' ')[1][0]}
              </div>

              {/* Trainer Info */}
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-white font-bold text-lg">{trainer.name}</h3>
                    <p className="text-orange-400 text-sm font-semibold">{trainer.specialty}</p>
                  </div>
                  <ArrowRight size={20} className="text-gray-400" />
                </div>

                {/* Rating */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1">
                    <Star size={16} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-white font-bold">{trainer.rating}</span>
                  </div>
                  <span className="text-gray-400 text-sm">•</span>
                  <span className="text-gray-400 text-sm">{trainer.experience} experience</span>
                </div>

                {/* Certifications */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <Award size={14} className="text-orange-400" />
                  {trainer.certifications.slice(0, 2).map((cert, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full border border-orange-500/30"
                    >
                      {cert}
                    </span>
                  ))}
                  {trainer.certifications.length > 2 && (
                    <span className="text-xs text-gray-400">
                      +{trainer.certifications.length - 2} more
                    </span>
                  )}
                </div>

                {/* Availability */}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={14} className="text-gray-400" />
                  <span className="text-gray-300">
                    Available {trainer.availability.length} days/week
                  </span>
                </div>
              </div>
            </div>

            {/* Bio Preview */}
            <p className="text-gray-400 text-sm mt-3 line-clamp-2">{trainer.bio}</p>

            {/* View Profile Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/member/trainer/${trainer.id.toLowerCase()}`);
              }}
              className="w-full mt-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all"
            >
              View Profile & Book
            </button>
          </motion.div>
        ))}
      </div>

      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-2xl p-5 shadow-xl"
      >
        <h3 className="text-white font-bold text-lg mb-2">Need Help Choosing?</h3>
        <p className="text-white/90 text-sm mb-3">
          Not sure which trainer is right for you? Our staff can help match you with the perfect coach based on your goals.
        </p>
        <button
          onClick={() => navigate('/member/chatbot')}
          className="bg-white text-orange-600 px-6 py-2 rounded-xl font-semibold hover:bg-gray-100 transition-all"
        >
          Chat with Us
        </button>
      </motion.div>
    </div>
  );
}
