import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { useGymContext } from '../hooks/useGymContext';
import { useNavigate } from 'react-router-dom';
import { TRAINERS } from '../data/trainers';
import { UserPlus, Star, Award, Calendar } from 'lucide-react';
import { showToast } from '../utils/toast';

export default function Trainers() {
  const { selectedGym } = useGymContext();
  const navigate = useNavigate();
  const gymTrainers = TRAINERS.filter(t => t.gymId === selectedGym.id);

  const handleAddTrainer = () => {
    const name = window.prompt('Trainer full name:');
    if (!name) return;
    const specialty = window.prompt('Specialization (e.g. Yoga, Boxing):') || 'General Fitness';
    showToast(`${name} added as a ${specialty} trainer! Update the trainers data file to persist.`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Trainers</h1>
          <p className="text-gray-400 mt-1">Manage gym trainers and schedules</p>
        </div>
        <Button 
          variant="primary" 
          className="shadow-lg shadow-primary-start/30 flex items-center gap-2"
          onClick={handleAddTrainer}
        >
          <UserPlus size={18} />
          Add Trainer
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-6 shadow-lg">
            <div className="relative z-10">
              <p className="text-white/80 text-sm font-medium">Total Trainers</p>
              <p className="text-4xl font-bold text-white mt-2 font-orbitron">{gymTrainers.length}</p>
            </div>
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 p-6 shadow-lg">
            <div className="relative z-10">
              <p className="text-white/80 text-sm font-medium">Avg Rating</p>
              <p className="text-4xl font-bold text-white mt-2 font-orbitron">
                {(gymTrainers.reduce((sum, t) => sum + t.rating, 0) / gymTrainers.length).toFixed(1)}
              </p>
            </div>
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 p-6 shadow-lg">
            <div className="relative z-10">
              <p className="text-white/80 text-sm font-medium">Total Sessions</p>
              <p className="text-4xl font-bold text-white mt-2 font-orbitron">
                {gymTrainers.reduce((sum, t) => sum + t.sessionsCompleted, 0)}
              </p>
            </div>
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          </div>
        </motion.div>
      </div>

      {/* Trainers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gymTrainers.map((trainer, index) => (
          <motion.div
            key={trainer.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + index * 0.1 }}
            whileHover={{ y: -5 }}
          >
            <Card className="group cursor-pointer hover:border-primary-start/50 transition-all duration-300">
              <div className="text-center">
                {/* Avatar */}
                <div className="relative inline-block mb-4">
                  <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary-start via-primary-end to-secondary flex items-center justify-center text-white text-4xl font-bold shadow-2xl group-hover:scale-110 transition-transform duration-300">
                    {trainer.name.split(' ')[1][0]}
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-green-500 rounded-full border-4 border-dark-lighter flex items-center justify-center shadow-lg">
                    <Award size={20} className="text-white" />
                  </div>
                </div>

                {/* Name & Specialization */}
                <h3 className="text-xl font-bold text-white group-hover:text-primary-start transition-colors font-orbitron">
                  {trainer.name}
                </h3>
                <Badge variant="Premium" className="mt-3 inline-block">
                  {trainer.specialization}
                </Badge>

                {/* Stats */}
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between p-3 bg-dark rounded-xl">
                    <span className="text-gray-400 text-sm flex items-center gap-2">
                      <Star size={16} className="text-yellow-400" />
                      Rating
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">{trainer.rating}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-dark rounded-xl">
                    <span className="text-gray-400 text-sm">Sessions</span>
                    <span className="text-white font-bold">{trainer.sessionsCompleted}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex gap-2">
                  <button 
                    onClick={() => navigate(`/trainers/${trainer.id}`)}
                    className="flex-1 py-2 px-4 bg-gradient-to-r from-primary-start to-primary-end text-white rounded-lg font-medium hover:shadow-lg hover:shadow-primary-start/30 transition-all duration-200"
                  >
                    View Profile
                  </button>
                  <button 
                    onClick={() => {
                      const days = trainer.availability?.map((a: any) => a.day).join(', ') || 'N/A';
                      showToast(`${trainer.name} available: ${days}`, 'info');
                    }}
                    className="p-2 bg-dark border border-dark-border rounded-lg hover:border-primary-start transition-colors"
                    title="View availability"
                  >
                    <Calendar size={20} className="text-gray-400" />
                  </button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
