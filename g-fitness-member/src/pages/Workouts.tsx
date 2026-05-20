import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Play, Clock, Flame, Dumbbell, ArrowLeft } from 'lucide-react';
import { showSuccessToast } from '../utils/errorHandler';

export default function Workouts() {
  const navigate = useNavigate();
  
  const handleStartWorkout = (workoutName: string) => {
    showSuccessToast(`Starting ${workoutName}...`);
    // In production: Navigate to workout timer/tracker
    setTimeout(() => {
      navigate('/member/progress');
    }, 1500);
  };
  
  const workouts = [
    {
      name: 'Full Body Strength',
      duration: '45 min',
      calories: '350 kcal',
      difficulty: 'Intermediate',
      color: 'from-red-500 to-orange-500',
    },
    {
      name: 'HIIT Cardio Blast',
      duration: '30 min',
      calories: '400 kcal',
      difficulty: 'Advanced',
      color: 'from-purple-500 to-pink-500',
    },
    {
      name: 'Core & Abs',
      duration: '20 min',
      calories: '180 kcal',
      difficulty: 'Beginner',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      name: 'Upper Body Power',
      duration: '40 min',
      calories: '320 kcal',
      difficulty: 'Intermediate',
      color: 'from-green-500 to-emerald-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <button
          onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl bg-dark-lighter border border-dark-border flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Workouts</h1>
          <p className="text-gray-400 mt-1">Choose your training program</p>
        </div>
      </motion.div>

      {/* Today's Workout */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-start via-primary-end to-secondary p-6 shadow-2xl"
      >
        <div className="relative z-10">
          <p className="text-white/80 text-sm font-medium">TODAY'S WORKOUT</p>
          <h2 className="text-2xl font-bold text-white mt-2 mb-4">Chest & Triceps</h2>
          
          <div className="flex gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-white/80" />
              <span className="text-white text-sm">60 min</span>
            </div>
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-white/80" />
              <span className="text-white text-sm">450 kcal</span>
            </div>
          </div>

          <button 
            onClick={() => handleStartWorkout("Chest & Triceps")}
            className="w-full bg-white text-primary-end font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:scale-105 transition-transform"
          >
            <Play size={20} fill="currentColor" />
            Start Workout
          </button>
        </div>

        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-3xl"></div>
      </motion.div>

      {/* Workout Library */}
      <div className="space-y-4">
        <h3 className="text-white font-semibold text-lg">Workout Library</h3>
        {workouts.map((workout, index) => (
          <motion.div
            key={workout.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.1 }}
            className="bg-dark-lighter border border-dark-border rounded-2xl p-4 hover:border-primary-start transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${workout.color} flex items-center justify-center flex-shrink-0`}>
                <Dumbbell size={28} className="text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-white font-semibold">{workout.name}</h4>
                <div className="flex gap-3 mt-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {workout.duration}
                  </span>
                  <span className="flex items-center gap-1">
                    <Flame size={12} />
                    {workout.calories}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full ${
                    workout.difficulty === 'Beginner' ? 'bg-green-500/20 text-green-400' :
                    workout.difficulty === 'Intermediate' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {workout.difficulty}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => handleStartWorkout(workout.name)}
                className="w-10 h-10 rounded-full bg-primary-start/20 flex items-center justify-center text-primary-start hover:bg-primary-start hover:text-white transition-all"
              >
                <Play size={18} fill="currentColor" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
