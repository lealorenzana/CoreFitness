import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MapPin, Star, Users, Dumbbell, ArrowRight, Award, TrendingUp, ArrowLeft } from 'lucide-react';
import MobileFrame from '../components/layout/MobileFrame';

interface Gym {
  id: string;
  name: string;
  location: string;
  rating: number;
  members: number;
  image: string;
  tagline: string;
  features: string[];
  successStory: string;
}

export default function GymList() {
  const navigate = useNavigate();

  const gyms: Gym[] = [
    {
      id: 'core-fitness',
      name: 'Core Fitness',
      location: 'Mamburao, Occidental Mindoro',
      rating: 4.9,
      members: 250,
      image: '/LOGO CORE FITNESS.png',
      tagline: 'Transform Your Body, Transform Your Life',
      features: ['24/7 Access', 'Personal Training', 'Modern Equipment', 'Group Classes'],
      successStory: '"Lost 15kg in 3 months! The trainers are amazing!" - Maria S.'
    },
    {
      id: 'fitness-regency',
      name: 'Fitness Regency',
      location: 'Mamburao, Occidental Mindoro',
      rating: 4.8,
      members: 180,
      image: '/FITNESS REGENCY LOGO.jpg',
      tagline: 'Where Champions Are Made',
      features: ['Olympic Weights', 'Boxing Ring', 'Sauna', 'Nutrition Coaching'],
      successStory: '"Gained 8kg of muscle! Best gym in town!" - Juan D.'
    },
    {
      id: 'ferrer-fitness',
      name: 'Ferrer Fitness',
      location: 'Mamburao, Occidental Mindoro',
      rating: 4.7,
      members: 150,
      image: '/logo.png',
      tagline: 'Your Fitness, Our Mission',
      features: ['Yoga Studio', 'Cardio Zone', 'Free Weights', 'Locker Rooms'],
      successStory: '"Finally found a gym that feels like home!" - Ana R.'
    }
  ];

  return (
    <MobileFrame>
      <div className="min-h-screen" style={{ backgroundColor: '#0d0d0d' }}>
        {/* Back Button */}
        <div className="px-6 pt-6 pb-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-400 hover:text-neon-yellow transition-colors group"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-semibold">Back to Login</span>
          </button>
        </div>

        {/* Hero Section */}
        <div className="relative px-6 py-10 mb-6">
          {/* Decorative Background Elements */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-neon-yellow/10 rounded-full blur-3xl"></div>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center relative z-10"
          >
            <div className="inline-block mb-4">
              <div className="flex items-center gap-2 bg-gradient-to-r from-orange-500/20 to-neon-yellow/20 border border-orange-500/40 rounded-full px-4 py-2">
                <Award className="w-4 h-4 text-orange-400" />
                <span className="text-orange-300 text-sm font-semibold">Premium Fitness Centers</span>
              </div>
            </div>
            
            <h1 className="text-4xl font-orbitron font-bold text-white mb-3 leading-tight">
              Start Your<br />
              <span className="bg-gradient-to-r from-orange-400 via-neon-yellow to-orange-400 bg-clip-text text-transparent">Fitness Journey</span>
            </h1>
            
            <p className="text-gray-300 text-base mb-6 max-w-xs mx-auto">
              Join Mamburao's Premier Fitness Community
            </p>
            
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Users className="w-5 h-5 text-orange-400" />
                </div>
                <p className="text-2xl font-bold text-white font-orbitron">580+</p>
                <p className="text-xs text-gray-400">Members</p>
              </div>
              <div className="w-px h-12 bg-orange-500/30"></div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Star className="w-5 h-5 text-neon-yellow fill-neon-yellow" />
                </div>
                <p className="text-2xl font-bold text-white font-orbitron">4.8</p>
                <p className="text-xs text-gray-400">Rating</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Why Choose Us Section */}
        <div className="px-6 py-6 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-6"
          >
            <h2 className="text-2xl font-bold text-white mb-2">Why Choose Us?</h2>
            <p className="text-gray-400 text-sm">Real results from real people</p>
          </motion.div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: TrendingUp, label: 'Proven Results', value: '95%', color: 'from-orange-500/20 to-orange-500/5', border: 'border-orange-500/30', iconColor: 'text-orange-400' },
              { icon: Users, label: 'Active Members', value: '580+', color: 'from-neon-yellow/20 to-neon-yellow/5', border: 'border-neon-yellow/30', iconColor: 'text-neon-yellow' },
              { icon: Award, label: 'Success Rate', value: '4.8★', color: 'from-orange-500/20 to-neon-yellow/10', border: 'border-orange-400/30', iconColor: 'text-orange-300' }
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className={`bg-gradient-to-br ${stat.color} border-2 ${stat.border} rounded-2xl p-4 text-center hover:border-opacity-60 transition-all`}
              >
                <stat.icon className={`w-7 h-7 ${stat.iconColor} mx-auto mb-3`} />
                <p className="text-2xl font-bold text-white font-orbitron mb-1">{stat.value}</p>
                <p className="text-[10px] text-gray-300 leading-tight">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Gyms List */}
        <div className="px-6 pb-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Choose Your Gym</h2>
            <div className="text-orange-400 text-sm font-semibold">{gyms.length} Locations</div>
          </div>
          
          {gyms.map((gym, index) => (
            <motion.div
              key={gym.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + index * 0.15 }}
              onClick={() => navigate(`/gym/${gym.id}`)}
              className="bg-gradient-to-br from-gray-900 to-gray-950 border-2 border-gray-700 rounded-3xl overflow-hidden hover:border-orange-500 hover:shadow-[0_0_30px_rgba(249,115,22,0.2)] transition-all duration-300 cursor-pointer group"
            >
              {/* Gym Image/Logo */}
              <div className="relative h-44 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden">
                {/* Decorative corner accent */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-orange-500/10 to-transparent rounded-bl-full"></div>
                <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-neon-yellow/10 to-transparent rounded-tr-full"></div>
                
                <img 
                  src={gym.image} 
                  alt={gym.name}
                  className="w-28 h-28 object-contain relative z-10 group-hover:scale-110 transition-transform duration-300"
                  onError={(e) => {
                    e.currentTarget.src = '/logo.png';
                  }}
                />
                
                {/* Rating Badge */}
                <div className="absolute top-4 right-4 bg-black/90 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-orange-500/50">
                  <Star className="w-4 h-4 text-orange-400 fill-orange-400" />
                  <span className="text-white text-sm font-bold">{gym.rating}</span>
                </div>
                
                {/* Members Badge */}
                <div className="absolute bottom-4 left-4 bg-gradient-to-r from-orange-500/20 to-neon-yellow/20 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-orange-400/40">
                  <Users className="w-3.5 h-3.5 text-orange-300" />
                  <span className="text-orange-200 text-xs font-semibold">{gym.members} Members</span>
                </div>
              </div>

              {/* Gym Info */}
              <div className="p-5">
                <h3 className="text-xl font-bold text-white mb-1.5 group-hover:text-orange-400 transition-colors">{gym.name}</h3>
                <p className="text-orange-300 font-semibold text-sm mb-3 italic">"{gym.tagline}"</p>
                
                <div className="flex items-center gap-2 text-gray-400 text-xs mb-4">
                  <MapPin className="w-3.5 h-3.5 text-orange-400" />
                  <span>{gym.location}</span>
                </div>

                {/* Features */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {gym.features.map((feature) => (
                    <span
                      key={feature}
                      className="bg-gradient-to-r from-orange-500/10 to-neon-yellow/10 text-orange-300 text-[11px] px-3 py-1.5 rounded-full border border-orange-500/30 font-medium"
                    >
                      {feature}
                    </span>
                  ))}
                </div>

                {/* Success Story */}
                <div className="bg-gradient-to-br from-orange-500/5 to-neon-yellow/5 border-l-2 border-orange-500/60 rounded-lg p-3 mb-4">
                  <p className="text-gray-200 text-xs italic leading-relaxed">{gym.successStory}</p>
                </div>

                {/* CTA Button */}
                <button className="w-full bg-gradient-to-r from-orange-500 to-orange-400 text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:from-orange-600 hover:to-orange-500 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-all group-hover:scale-[1.02]">
                  <Dumbbell className="w-5 h-5" />
                  <span>Explore {gym.name}</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="px-6 pb-8 pt-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="relative bg-gradient-to-br from-orange-500/10 via-gray-900 to-neon-yellow/10 border-2 border-orange-500/50 rounded-3xl p-6 text-center overflow-hidden"
          >
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-neon-yellow/10 rounded-full blur-2xl"></div>
            
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500/20 to-neon-yellow/20 border border-orange-400/40 rounded-full px-4 py-1.5 mb-4">
                <TrendingUp className="w-4 h-4 text-orange-400" />
                <span className="text-orange-300 text-xs font-semibold">Join The Movement</span>
              </div>
              
              <h3 className="text-white font-bold text-2xl mb-2">Ready to Transform?</h3>
              <p className="text-gray-300 text-sm mb-5 max-w-xs mx-auto">
                Join hundreds of members achieving their fitness goals every day
              </p>
              
              <button
                onClick={() => navigate('/register')}
                className="bg-gradient-to-r from-orange-500 to-orange-400 text-white px-10 py-4 rounded-xl font-bold hover:from-orange-600 hover:to-orange-500 transition-all hover:shadow-[0_0_30px_rgba(249,115,22,0.4)] inline-flex items-center gap-2 group"
              >
                <span>Register Now</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </MobileFrame>
  );
}
