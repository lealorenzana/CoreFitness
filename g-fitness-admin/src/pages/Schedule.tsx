import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { Calendar, Clock, Users, Plus, Edit, Trash2, User, CheckCircle, XCircle } from 'lucide-react';
import { showToast } from '../utils/toast';
import { SharedStorage } from '../utils/sharedStorage';

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
  const [activeTab, setActiveTab] = useState<'classes' | 'staff' | 'bookings'>('classes');
  const [classBookings, setClassBookings] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);

  // Load class bookings from shared storage
  useEffect(() => {
    const bookings = SharedStorage.getBookings();
    setClassBookings(bookings);
  }, []);

  // Refresh bookings periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const bookings = SharedStorage.getBookings();
      setClassBookings(bookings);
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, []);

  const handleConfirmBooking = (bookingId: string) => {
    const note = prompt('Add a note for the member (optional):');
    SharedStorage.updateBooking(bookingId, { 
      status: 'Confirmed',
      adminNote: note || '',
      approvedAt: new Date().toISOString()
    });
    setClassBookings(SharedStorage.getBookings());
    showToast('Booking approved successfully!', 'success');
  };

  const handleCancelBooking = (bookingId: string) => {
    const reason = prompt('Reason for rejection (will be shown to member):');
    if (reason) {
      SharedStorage.updateBooking(bookingId, { 
        status: 'Rejected',
        rejectionReason: reason,
        rejectedAt: new Date().toISOString()
      });
      setClassBookings(SharedStorage.getBookings());
      showToast('Booking rejected', 'success');
    }
  };

  const initialClassSchedules: ClassSchedule[] = [
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

  // Initialize schedules state from the static data
  useEffect(() => {
    setSchedules(initialClassSchedules);
  }, []);

  const handleAddClass = () => {
    const name = window.prompt('Class name (e.g. Morning HIIT):');
    if (!name) return;
    const instructor = window.prompt('Instructor name:') || 'TBA';
    const day = window.prompt('Day (e.g. Monday):') || 'Monday';
    const time = window.prompt('Time (e.g. 6:00 AM):') || '6:00 AM';
    const capacity = parseInt(window.prompt('Max capacity:') || '20', 10);
    const room = window.prompt('Room (e.g. Studio A):') || 'Studio A';
    const newClass: ClassSchedule = {
      id: `class-${Date.now()}`,
      name,
      instructor,
      day,
      time,
      duration: 60,
      capacity,
      enrolled: 0,
      room,
    };
    setSchedules(prev => [...prev, newClass]);
    showToast(`${name} class added!`, 'success');
  };

  const handleEditClass = (classItem: ClassSchedule) => {
    const newName = window.prompt('Edit class name:', classItem.name);
    if (!newName) return;
    const newTime = window.prompt('Edit time:', classItem.time) || classItem.time;
    const newRoom = window.prompt('Edit room:', classItem.room) || classItem.room;
    setSchedules(prev =>
      prev.map(c => c.id === classItem.id ? { ...c, name: newName, time: newTime, room: newRoom } : c)
    );
    showToast(`${newName} updated!`, 'success');
  };

  const handleDeleteClass = (classItem: ClassSchedule) => {
    if (window.confirm(`Delete "${classItem.name}"? This cannot be undone.`)) {
      setSchedules(prev => prev.filter(c => c.id !== classItem.id));
      showToast(`${classItem.name} deleted`, 'success');
    }
  };

  const classSchedules = schedules;


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
          onClick={() => {
            if (activeTab === 'classes') handleAddClass();
            else showToast('Add Staff: contact HR to onboard new staff', 'info');
          }}
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
          onClick={() => setActiveTab('bookings')}
          className={`px-6 py-3 font-semibold transition-all relative ${
            activeTab === 'bookings'
              ? 'text-primary-start'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Class Bookings
          {classBookings.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-primary-start text-white text-xs rounded-full">
              {classBookings.length}
            </span>
          )}
          {activeTab === 'bookings' && (
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

      {/* Class Bookings Tab */}
      {activeTab === 'bookings' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-dark-border">
                    <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs">Member</th>
                    <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs">Class</th>
                    <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs">Trainer</th>
                    <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs">Schedule</th>
                    <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs">Status</th>
                    <th className="text-left py-4 px-4 text-gray-400 font-semibold uppercase text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classBookings.length > 0 ? (
                    classBookings.map((booking, index) => (
                      <tr key={booking.id} className="border-b border-dark-border hover:bg-dark-border/50">
                        <td className="py-4 px-4">
                          <div>
                            <p className="text-white font-semibold">{booking.memberName}</p>
                            <p className="text-gray-400 text-sm">{booking.memberEmail}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-white font-medium">{booking.className}</p>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-white">{booking.trainerName}</p>
                        </td>
                        <td className="py-4 px-4">
                          <div>
                            <p className="text-white">{booking.day}</p>
                            <p className="text-gray-400 text-sm">{booking.time}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant={
                            booking.status === 'Confirmed' ? 'Active' :
                            booking.status === 'Rejected' ? 'Expired' :
                            booking.status === 'Cancelled' ? 'Expired' :
                            'Suspended'
                          }>
                            {booking.status}
                          </Badge>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            {booking.status === 'Pending' && (
                              <>
                                <button
                                  onClick={() => handleConfirmBooking(booking.id)}
                                  className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-1 text-sm font-semibold"
                                >
                                  <CheckCircle size={14} />
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleCancelBooking(booking.id)}
                                  className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors flex items-center gap-1 text-sm font-semibold"
                                >
                                  <XCircle size={14} />
                                  Reject
                                </button>
                              </>
                            )}
                            {booking.status === 'Confirmed' && (
                              <div className="flex flex-col gap-1">
                                <span className="text-green-400 text-sm font-semibold">✓ Approved</span>
                                {booking.adminNote && (
                                  <span className="text-gray-400 text-xs">Note: {booking.adminNote}</span>
                                )}
                              </div>
                            )}
                            {booking.status === 'Rejected' && (
                              <div className="flex flex-col gap-1">
                                <span className="text-red-400 text-sm font-semibold">✗ Rejected</span>
                                {booking.rejectionReason && (
                                  <span className="text-gray-400 text-xs">Reason: {booking.rejectionReason}</span>
                                )}
                              </div>
                            )}
                            {booking.status === 'Cancelled' && (
                              <span className="text-gray-400 text-sm">Cancelled by member</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <Calendar size={48} className="text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400">No class bookings yet</p>
                        <p className="text-gray-500 text-sm mt-1">Bookings from members will appear here</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}

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
                            onClick={() => handleEditClass(classItem)}
                            className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
                            title="Edit class"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteClass(classItem)}
                            className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                            title="Delete class"
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
                            onClick={() => {
                              const newShift = window.prompt(`Edit shift for ${staff.name}:`, staff.shift);
                              if (newShift) showToast(`${staff.name}'s shift updated to ${newShift}`, 'success');
                            }}
                            className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => showToast(`${staff.name} | ${staff.role} | Shift: ${staff.shift} | Classes: ${staff.classes}`, 'info')}
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
