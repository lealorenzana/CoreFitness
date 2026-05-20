import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, User, CheckCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trainers as trainerData } from '../data/trainers';
import { showSuccessToast } from '../utils/errorHandler';
import { SharedStorage } from '../utils/sharedStorage';
import { getCurrentUser } from '../utils/auth';

interface Trainer {
  id: string;
  name: string;
  specialization: string;
  photo: string;
  rating: number;
  availability: { day: string; slots: string[] }[];
}

interface ClassType {
  id: string;
  name: string;
  icon: string;
  duration: string;
  description: string;
}

export default function BookClass() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedClassType, setSelectedClassType] = useState<string | null>(null);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const classTypes: ClassType[] = [
    { id: '1', name: 'Strength Training', icon: '💪', duration: '60 min', description: 'Build muscle and increase strength' },
    { id: '2', name: 'HIIT', icon: '🔥', duration: '45 min', description: 'High-intensity interval training' },
    { id: '3', name: 'Yoga', icon: '🧘', duration: '60 min', description: 'Flexibility and mindfulness' },
    { id: '4', name: 'Boxing', icon: '🥊', duration: '50 min', description: 'Combat training and cardio' },
    { id: '5', name: 'CrossFit', icon: '⚡', duration: '60 min', description: 'Functional fitness workout' }
  ];

  const trainers: Trainer[] = trainerData.map(t => ({
    id: t.id,
    name: t.name,
    specialization: t.specialty,
    photo: t.image,
    rating: t.rating,
    availability: t.availability
  }));

  const handleBooking = () => {
    const currentUser = getCurrentUser();
    const className = classTypes.find(c => c.id === selectedClassType)?.name;
    
    // Create booking object
    const booking = {
      id: `booking-${Date.now()}`,
      memberId: currentUser?.email || 'eya.lorenzana@email.com',
      memberName: currentUser?.name || 'Eya Lorenzana',
      memberEmail: currentUser?.email || 'eya.lorenzana@email.com',
      className: className || '',
      classType: selectedClassType || '',
      trainerName: selectedTrainer?.name || '',
      trainerId: selectedTrainer?.id || '',
      day: selectedDay || '',
      time: selectedTime || '',
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };
    
    // Save to shared storage (visible to admin)
    SharedStorage.addBooking(booking);
    
    showSuccessToast(`${className} class booked successfully!`);
    
    // Reset and navigate after short delay
    setTimeout(() => {
      setStep(1);
      setSelectedClassType(null);
      setSelectedTrainer(null);
      setSelectedDay(null);
      setSelectedTime(null);
      navigate('/member/booking-history');
    }, 1500);
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Header with Back Button */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <button
          onClick={() => navigate('/member/home')}
          className="w-10 h-10 rounded-xl bg-gray-800 border-2 border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:border-primary-start transition-all shadow-lg"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-orbitron font-bold text-white">Book a Class</h1>
          <p className="text-gray-400 text-sm mt-1">Schedule your training session</p>
        </div>
      </motion.div>

      {/* Progress Steps */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gray-800 border-2 border-gray-600 rounded-2xl p-4 shadow-lg"
      >
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? 'bg-gradient-to-br from-primary-start to-primary-end text-white' : 'bg-black border border-gray-800 text-gray-400'}`}>
                {s}
              </div>
              {s < 4 && <div className={`w-8 h-1 mx-1 ${step > s ? 'bg-primary-start' : 'bg-gray-800'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>Class</span>
          <span>Trainer</span>
          <span>Day</span>
          <span>Time</span>
        </div>
      </motion.div>
          {/* Step 1: Select Class Type */}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-3"
            >
              <h2 className="text-lg font-bold text-white mb-3">Select Class Type</h2>
              {classTypes.map((classType) => (
                <motion.button
                  key={classType.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedClassType(classType.id);
                    setStep(2);
                  }}
                  className={`w-full bg-gray-800 border-2 ${selectedClassType === classType.id ? 'border-primary-start' : 'border-gray-600'} rounded-xl p-4 text-left hover:border-primary-start/50 transition-colors shadow-lg`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-4xl">{classType.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold">{classType.name}</h3>
                      <p className="text-xs text-gray-400 mt-1">{classType.description}</p>
                      <p className="text-xs text-primary-start mt-1">{classType.duration}</p>
                    </div>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Step 2: Select Trainer */}
          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-white">Select Trainer</h2>
                <button onClick={() => setStep(1)} className="text-primary-start text-sm font-semibold">Back</button>
              </div>
              {trainers.map((trainer) => (
                <motion.button
                  key={trainer.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedTrainer(trainer);
                    setStep(3);
                  }}
                  className={`w-full bg-gray-800 border-2 ${selectedTrainer?.id === trainer.id ? 'border-primary-start' : 'border-gray-600'} rounded-xl p-4 text-left hover:border-primary-start/50 transition-colors shadow-lg`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center text-white font-bold text-xl">
                      {trainer.name.split(' ')[1][0]}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold">{trainer.name}</h3>
                      <p className="text-xs text-gray-400 mt-1">{trainer.specialization}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-yellow-400">⭐</span>
                        <span className="text-xs text-white">{trainer.rating}</span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Step 3: Select Day */}
          {step === 3 && selectedTrainer && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-white">Select Day</h2>
                <button onClick={() => setStep(2)} className="text-primary-start text-sm font-semibold">Back</button>
              </div>
              {selectedTrainer.availability.map((avail) => (
                <motion.button
                  key={avail.day}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedDay(avail.day);
                    setStep(4);
                  }}
                  className={`w-full bg-gray-800 border-2 ${selectedDay === avail.day ? 'border-primary-start' : 'border-gray-600'} rounded-xl p-4 text-left hover:border-primary-start/50 transition-colors shadow-lg`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-primary-start" />
                      <span className="text-white font-semibold">{avail.day}</span>
                    </div>
                    <span className="text-xs text-gray-400">{avail.slots.length} slots available</span>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Step 4: Select Time */}
          {step === 4 && selectedTrainer && selectedDay && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-white">Select Time</h2>
                <button onClick={() => setStep(3)} className="text-primary-start text-sm font-semibold">Back</button>
              </div>
              {selectedTrainer.availability
                .find(a => a.day === selectedDay)
                ?.slots.map((slot) => (
                  <motion.button
                    key={slot}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedTime(slot)}
                    className={`w-full bg-gray-800 border-2 ${selectedTime === slot ? 'border-primary-start' : 'border-gray-600'} rounded-xl p-4 text-left hover:border-primary-start/50 transition-colors shadow-lg`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-primary-start" />
                        <span className="text-white font-semibold">{slot}</span>
                      </div>
                      {selectedTime === slot && <CheckCircle className="w-5 h-5 text-primary-start" />}
                    </div>
                  </motion.button>
                ))}

              {/* Booking Summary */}
              {selectedTime && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gray-800 border-2 border-primary-start/50 rounded-xl p-4 mt-4 shadow-lg"
                >
                  <h3 className="text-white font-semibold mb-3">Booking Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Class:</span>
                      <span className="text-white">{classTypes.find(c => c.id === selectedClassType)?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Trainer:</span>
                      <span className="text-white">{selectedTrainer.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Day:</span>
                      <span className="text-white">{selectedDay}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Time:</span>
                      <span className="text-white">{selectedTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Location:</span>
                      <span className="text-white">Core Fitness Main Studio</span>
                    </div>
                  </div>

                  <button
                    onClick={handleBooking}
                    className="w-full mt-4 bg-gradient-to-r from-primary-start to-primary-end text-white py-3 rounded-xl font-semibold hover:shadow-lg hover:shadow-primary-start/30 transition-all"
                  >
                    Confirm Booking
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
    </div>
  );
}
