import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import { useGymContext } from '../hooks/useGymContext';
import { MEMBERS } from '../data/members';
import { formatCurrency } from '../utils/formatters';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, UserCheck, Activity, DollarSign, TrendingUp, Calendar, BarChart3, ArrowRight } from 'lucide-react';
import { showToast } from '../utils/toast';
import { useNavigate } from 'react-router-dom';
import { SharedStorage } from '../utils/sharedStorage';

export default function Dashboard() {
  const { selectedGym } = useGymContext();
  const navigate = useNavigate();
  
  // Get pending bookings count
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);
  
  useEffect(() => {
    const bookings = SharedStorage.getBookings();
    const pending = bookings.filter((b: any) => b.status === 'Pending').length;
    setPendingBookingsCount(pending);
  }, []);

  // Auto-refresh pending count
  useEffect(() => {
    const interval = setInterval(() => {
      const bookings = SharedStorage.getBookings();
      const pending = bookings.filter((b: any) => b.status === 'Pending').length;
      setPendingBookingsCount(pending);
    }, 2000);

    return () => clearInterval(interval);
  }, []);
  
  const gymMembers = MEMBERS.filter(m => m.gymId === selectedGym.id);
  const activeMembers = gymMembers.filter(m => m.membershipStatus === 'Active');
  const todayAttendance = Math.floor(activeMembers.length * 0.6);
  const monthlyRevenue = activeMembers.reduce((sum, m) => {
    const prices = { Basic: 800, Standard: 1500, Premium: 2500 };
    return sum + prices[m.membershipType];
  }, 0);

  const kpis = [
    { label: 'Total Members', value: gymMembers.length, trend: '+12%', icon: Users, color: 'from-blue-500 to-cyan-500' },
    { label: 'Active Members', value: activeMembers.length, trend: '+8%', icon: UserCheck, color: 'from-green-500 to-emerald-500' },
    { label: "Today's Attendance", value: todayAttendance, trend: '+5%', icon: Activity, color: 'from-purple-500 to-pink-500' },
    { label: 'Monthly Revenue', value: formatCurrency(monthlyRevenue), trend: '+15%', icon: DollarSign, color: 'from-primary-start to-primary-end' },
  ];

  // Mock chart data
  const revenueData = [
    { month: 'Jan', revenue: 45000 },
    { month: 'Feb', revenue: 52000 },
    { month: 'Mar', revenue: 48000 },
    { month: 'Apr', revenue: 61000 },
    { month: 'May', revenue: 55000 },
    { month: 'Jun', revenue: monthlyRevenue },
  ];

  const attendanceData = [
    { day: 'Mon', count: 45 },
    { day: 'Tue', count: 52 },
    { day: 'Wed', count: 48 },
    { day: 'Thu', count: 61 },
    { day: 'Fri', count: 55 },
    { day: 'Sat', count: 70 },
    { day: 'Sun', count: 38 },
  ];

  // Membership growth data
  const membershipGrowthData = [
    { month: 'Jan', members: 45, newMembers: 8 },
    { month: 'Feb', members: 52, newMembers: 7 },
    { month: 'Mar', members: 58, newMembers: 6 },
    { month: 'Apr', members: 65, newMembers: 7 },
    { month: 'May', members: 71, newMembers: 6 },
    { month: 'Jun', members: gymMembers.length, newMembers: 5 },
  ];

  return (
    <div className="space-y-8">
      {/* Header with gradient background */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-start via-primary-end to-secondary p-8 shadow-2xl"
      >
        <div className="relative z-10">
          <h1 className="text-4xl font-orbitron font-bold text-white drop-shadow-lg">Dashboard</h1>
          <p className="text-white/90 mt-2 text-lg">Welcome to {selectedGym.name} • {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
      </motion.div>

      {/* KPI Cards with enhanced design */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
            >
              <div className="relative group">
                <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity duration-300`}></div>
                <Card className="relative backdrop-blur-sm border-2 border-dark-border hover:border-primary-start/50 transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-gray-400 text-sm font-medium uppercase tracking-wide">{kpi.label}</p>
                      <p className="text-4xl font-bold text-white mt-3 font-orbitron">{kpi.value}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-green-400 text-sm font-semibold bg-green-400/10 px-2 py-1 rounded-full flex items-center gap-1">
                          <TrendingUp size={14} />
                          {kpi.trend}
                        </span>
                        <span className="text-gray-500 text-xs">vs last month</span>
                      </div>
                    </div>
                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${kpi.color} shadow-lg`}>
                      <Icon size={28} className="text-white" />
                    </div>
                  </div>
                </Card>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card header={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={20} className="text-primary-start" />
                <h3 className="font-semibold text-white text-lg">Revenue Trend</h3>
              </div>
              <span className="text-xs text-gray-400 bg-dark-border px-3 py-1 rounded-full flex items-center gap-1">
                <Calendar size={12} />
                Last 6 Months
              </span>
            </div>
          }>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                <XAxis dataKey="month" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }}
                  labelStyle={{ color: '#FDB813' }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#FDB813" strokeWidth={3} dot={{ fill: '#FF6B35', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card header={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 size={20} className="text-secondary" />
                <h3 className="font-semibold text-white text-lg">Weekly Attendance</h3>
              </div>
              <span className="text-xs text-gray-400 bg-dark-border px-3 py-1 rounded-full">This Week</span>
            </div>
          }>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                <XAxis dataKey="day" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }}
                  labelStyle={{ color: '#8B5CF6' }}
                />
                <Bar dataKey="count" fill="url(#colorGradient)" radius={[8, 8, 0, 0]} />
                <defs>
                  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" />
                    <stop offset="100%" stopColor="#FF6B35" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* Membership Growth Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-blue-400" />
              <h3 className="font-semibold text-white text-lg">Membership Growth</h3>
            </div>
            <span className="text-xs text-gray-400 bg-dark-border px-3 py-1 rounded-full flex items-center gap-1">
              <Calendar size={12} />
              Last 6 Months
            </span>
          </div>
        }>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={membershipGrowthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
              <XAxis dataKey="month" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px' }}
                labelStyle={{ color: '#3B82F6' }}
              />
              <Line 
                type="monotone" 
                dataKey="members" 
                stroke="#3B82F6" 
                strokeWidth={3} 
                dot={{ fill: '#3B82F6', r: 6 }} 
                name="Total Members"
              />
              <Line 
                type="monotone" 
                dataKey="newMembers" 
                stroke="#10B981" 
                strokeWidth={2} 
                dot={{ fill: '#10B981', r: 4 }} 
                strokeDasharray="5 5"
                name="New Members"
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-gray-400 text-sm">Total Members</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-gray-400 text-sm">New Members</span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Activity and Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card header={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={20} className="text-green-400" />
                <h3 className="font-semibold text-white text-lg">Recent Activity</h3>
              </div>
              <span className="text-xs text-primary-start cursor-pointer hover:text-primary-end transition-colors flex items-center gap-1" onClick={() => {
                showToast('Viewing all recent activity...', 'info');
                navigate('/attendance');
              }}>
                View All <ArrowRight size={14} />
              </span>
            </div>
          }>
            <div className="space-y-3">
              {activeMembers.slice(0, 5).map((member, idx) => (
                <motion.div 
                  key={member.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + idx * 0.1 }}
                  className="flex items-center gap-4 p-4 bg-dark rounded-xl hover:bg-dark-border transition-all duration-200 group cursor-pointer border border-transparent hover:border-primary-start/30"
                  onClick={() => {
                    showToast(`Viewing ${member.fullName}'s profile...`, 'info');
                    navigate(`/members/${member.id}`);
                  }}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center text-white font-bold text-lg shadow-lg">
                      {member.firstName[0]}{member.lastName[0]}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-dark"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold group-hover:text-primary-start transition-colors">{member.fullName}</p>
                    <p className="text-gray-400 text-sm">Checked in • {Math.floor(Math.random() * 30) + 1} mins ago</p>
                  </div>
                  <ArrowRight size={18} className="text-gray-600 group-hover:text-primary-start transition-colors" />
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Card header={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 size={20} className="text-blue-400" />
                <h3 className="font-semibold text-white text-lg">Quick Stats</h3>
              </div>
              <span className="text-xs text-gray-400 bg-dark-border px-3 py-1 rounded-full">Live Data</span>
            </div>
          }>
            <div className="space-y-5">
              {[
                { 
                  label: 'Pending Booking Requests', 
                  value: pendingBookingsCount, 
                  icon: Calendar, 
                  color: 'text-yellow-400',
                  clickable: true,
                  onClick: () => navigate('/schedule')
                },
                { label: 'Membership Renewals This Month', value: '12', icon: TrendingUp, color: 'text-blue-400' },
                { label: 'New Members This Week', value: '5', icon: Users, color: 'text-green-400' },
                { label: 'Average Daily Attendance', value: Math.floor(activeMembers.length * 0.65), icon: Activity, color: 'text-purple-400' },
                { label: 'Retention Rate', value: '87%', icon: TrendingUp, color: 'text-primary-start' },
              ].map((stat, idx) => {
                const StatIcon = stat.icon;
                return (
                  <motion.div 
                    key={stat.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + idx * 0.1 }}
                    onClick={stat.clickable ? stat.onClick : undefined}
                    className={`flex items-center justify-between p-4 bg-dark rounded-xl hover:bg-dark-border transition-all duration-200 group border border-transparent hover:border-primary-start/20 ${stat.clickable ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <StatIcon size={20} className={stat.color} />
                      <span className="text-gray-300 group-hover:text-white transition-colors">{stat.label}</span>
                      {stat.clickable && stat.value > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-yellow-500 text-black text-xs rounded-full font-bold animate-pulse">
                          {stat.value}
                        </span>
                      )}
                    </div>
                    <span className={`text-2xl font-bold font-orbitron ${stat.color}`}>{stat.value}</span>
                  </motion.div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
