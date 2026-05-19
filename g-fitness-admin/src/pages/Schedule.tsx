import { motion } from 'framer-motion';
import { useState } from 'react';
import Card from '../components/ui/Card';
import { Calendar, Clock, Users, Plus, Edit, Trash2, User } from 'lucide-react';
import { showToast } from '../utils/toast';

interface ClassSchedule {
  id: string;
  name: string;
  instructor: string;
  day: string;
  time: string;
  duration: number;
  capacity: number;
  enrolled: number;
  room: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  shift: string;
  status: 'active' | 'off' | 'leave';
  classes: number;
}

export default function Schedule() {
  const [activeTab, setActiveTab] = useState<'classes' | 'staff'>('classes');

  const classSchedules: ClassSchedule[] = [
    {
      id: '1',
      name: 'Morning HIIT',
      instructor: 'Coach Maria',
      day: 'Monday',
      time: '6:00 AM',
      duration: 45,
      capacity: 20,
      enrolled: 18,
      room: 'Studio A',
    },
    {
      id: '2',
      name: 'Yoga Flow',
      instructor: 'Coach Ana',
      day: 'Monday',
      time: '7:00 AM',
      duration: 60,
      capacity: 15,
      enrolled: 12,
      room: 'Studio B',
    },
    {
      id: '3',
      name: 'Strength Training',
      instructor: 'Coach Pedro',
      day: 'Monday',
      time: '6:00 PM',
      duration: 60,
      capacity: 25,
      enrolled: 22,
      room: 'Main Floor',
    },
    {
      id: '4',
      name: 'Zumba Dance',
      instructor: 'Coach Lisa',
      day: 'Tuesday',
      time: '7:00 PM',
      duration: 45,
      capacity: 30,
      enrolled: 28,
      room: 'Studio A',
    },
    {
      id: '5',
      name: 'Boxing Basics',
      instructor: 'Coach Carlos',
      day: 'Wednesday',
      time: '6:00 PM',
      duration: 60,
      capacity: 15,
      enrolled: 10,
      room: 'Boxing Ring',
    },
  ];

  const staffMembers: StaffMember[] = [
    {
      id: '1',
      name: 'Coach Maria Santos',
      role: 'Head Trainer',
      shift: '6:00 AM - 2:00 PM',
      status: 'active',
      classes: 5,
    },
    {
      id: '2',
      name: 'Coach Pedro Reyes',
      role: 'Strength Coach',
      shift: '2:00 PM - 10:00 PM',
      status: 'active',
      classes: 4,
    },
    {
      id: '3',
      name: 'Coach Ana Garcia',
      role: 'Yoga Instructor',
      shift: '7:00 AM - 3:00 PM',
      status: 'active',
      classes: 6,
    },
    {
      id: '4',
      name: 'Coach Carlos Mendoza',
      role: 'Boxing Coach',
      shift: '4:00 PM - 10:00 PM',
      status: 'active',
      classes: 3,
    },
    {
      id: '5',
      name: 'Coach Lisa Tan',
      role: 'Dance Instructor',
      shift: '5:00 PM - 9:00 PM',
      status: 'off',
      classes: 2,
    },
    {
      id: '6',
      name: 'Juan Dela Cruz',
      role: 'Front Desk',
      shift: '8:00 AM - 4:00 PM',
      status: 'active',
      classes: 0,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'off':
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
      case 'leave':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const getCapacityColor = (enrolled: number, capacity: number) => {
    const percentage = (enrolled / capacity) * 100;
    if (percentage >= 90) return 'text-red-400';
    if (percentage >= 70) return 'text-yellow-400';
    return 'text-green-400';
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
          <h1 className="text-3xl font-orbitron font-bold text-gradient">Schedule Management</h1>
          <p className="text-gray-400 mt-1">Manage classes and staff schedules</p>
        </div>
        <button 
          onClick={() => showToast(activeTab === 'classes' ? 'Add Class modal would open here' : 'Add Staff modal would open here', 'info')}
          className="px-6 py-3 bg-gradient-to-r from-primary-start to-primary-end text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-primary-start/30 transition-all flex items-center gap-2"
        >
          <Plus size={20} />
          {activeTab === 'classes' ? 'Add Class' : 'Add Staff'}
        </button>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-4 border-b border-dark-border"
      >
        <button
          onClick={() => setActiveTab('classes')}
          className={`px-6 py-3 font-semibold transition-all relative ${
            activeTab === 'classes'
              ? 'text-primary-start'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Class Schedule
          {activeTab === 'classes' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-start to-primary-end"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('staff')}
          className={`px-6 py-3 font-semibold transition-all relative ${
            activeTab === 'staff'
              ? 'text-primary-start'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Staff Management
          {activeTab === 'staff' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-start to-primary-end"
            />
          )}
        </button>
      </motion.div>

      {/* Class Schedule Tab */}
      {activeTab === 'classes' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Class Name</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Instructor</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Day</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Time</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Duration</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Capacity</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Room</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classSchedules.map((classItem, index) => (
                    <motion.tr
                      key={classItem.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      className="border-b border-dark-border/50 hover:bg-dark-border/30 transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center">
                            <Calendar size={20} className="text-white" />
                          </div>
                          <p className="text-white font-semibold">{classItem.name}</p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-gray-300">{classItem.instructor}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-gray-300">{classItem.day}</p>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 text-gray-300">
                          <Clock size={14} className="text-gray-400" />
                          {classItem.time}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-gray-300">{classItem.duration} min</p>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-dark rounded-full overflow-hidden max-w-[80px]">
                            <div
                              className={`h-full ${
                                (classItem.enrolled / classItem.capacity) * 100 >= 90
                                  ? 'bg-red-500'
                                  : (classItem.enrolled / classItem.capacity) * 100 >= 70
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                              }`}
                              style={{ width: `${(classItem.enrolled / classItem.capacity) * 100}%` }}
                            ></div>
                          </div>
                          <span className={`text-sm font-semibold ${getCapacityColor(classItem.enrolled, classItem.capacity)}`}>
                            {classItem.enrolled}/{classItem.capacity}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-gray-300">{classItem.room}</p>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => showToast(`Editing ${classItem.name}`, 'info')}
                            className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => showToast(`${classItem.name} deleted`, 'success')}
                            className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Staff Management Tab */}
      {activeTab === 'staff' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Staff Member</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Role</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Shift</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Classes</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Status</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffMembers.map((staff, index) => (
                    <motion.tr
                      key={staff.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      className="border-b border-dark-border/50 hover:bg-dark-border/30 transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-purple-600 flex items-center justify-center">
                            <User size={20} className="text-white" />
                          </div>
                          <p className="text-white font-semibold">{staff.name}</p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-gray-300">{staff.role}</p>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 text-gray-300">
                          <Clock size={14} className="text-gray-400" />
                          {staff.shift}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Users size={14} className="text-gray-400" />
                          <span className="text-white font-semibold">{staff.classes}</span>
                          <span className="text-gray-400 text-sm">classes</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase border ${getStatusColor(staff.status)}`}>
                          {staff.status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => showToast(`Editing ${staff.name}`, 'info')}
                            className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => showToast(`Viewing schedule for ${staff.name}`, 'info')}
                            className="px-3 py-1 rounded-lg bg-primary-start/20 text-primary-start hover:bg-primary-start/30 transition-all text-xs font-semibold"
                          >
                            View Schedule
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
