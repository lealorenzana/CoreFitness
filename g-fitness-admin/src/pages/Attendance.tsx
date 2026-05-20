import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import QRScanner from '../components/ui/QRScanner';
import { useGymContext } from '../hooks/useGymContext';
import { MEMBERS } from '../data/members';
import { QrCode, UserCheck, Search, Calendar, Clock, TrendingUp, Camera } from 'lucide-react';
import { showToast } from '../utils/toast';

// Simple QR validation for admin
const validateQR = (qrCode: string) => {
  try {
    const decoded = atob(qrCode);
    const qrData = JSON.parse(decoded);
    
    const now = Date.now();
    const expirationTime = qrData.timestamp + (qrData.expiresIn * 1000);
    
    if (now > expirationTime) {
      return { valid: false, reason: 'QR Code expired', data: null };
    }
    
    return { valid: true, data: qrData };
  } catch {
    return { valid: false, reason: 'Invalid QR Code format', data: null };
  }
};

interface AttendanceRecord {
  id: string;
  memberId: string;
  memberName: string;
  checkInTime: Date;
  method: 'qr' | 'manual';
}

export default function Attendance() {
  const { selectedGym } = useGymContext();
  const gymMembers = MEMBERS.filter(m => m.gymId === selectedGym.id);
  
  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>('scan');
  const [qrInput, setQrInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  // Load attendance from localStorage or use default
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>(() => {
    const today = new Date().toDateString();
    const saved = localStorage.getItem(`attendance_${selectedGym.id}_${today}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Convert string dates back to Date objects
      return parsed.map((record: any) => ({
        ...record,
        checkInTime: new Date(record.checkInTime)
      }));
    }
    return [
      {
        id: '1',
        memberId: 'GF-2024-001',
        memberName: 'Eya Lorenzana',
        checkInTime: new Date(Date.now() - 1000 * 60 * 30),
        method: 'qr',
      },
      {
        id: '2',
        memberId: 'GF-2024-002',
        memberName: 'Maria Santos',
        checkInTime: new Date(Date.now() - 1000 * 60 * 45),
        method: 'manual',
      },
    ];
  });

  // Save to localStorage whenever attendance changes
  useEffect(() => {
    const today = new Date().toDateString();
    localStorage.setItem(`attendance_${selectedGym.id}_${today}`, JSON.stringify(todayAttendance));
  }, [todayAttendance, selectedGym.id]);

  const handleQRCheckIn = (qrCodeValue?: string) => {
    const qrToValidate = qrCodeValue || qrInput.trim();
    
    if (!qrToValidate) {
      showToast('Please enter a QR code', 'error');
      return;
    }
    
    // Validate QR code
    const validation = validateQR(qrToValidate);
    
    if (!validation.valid) {
      showToast(`❌ ${validation.reason}`, 'error');
      return;
    }
    
    const member = gymMembers.find(m => m.qrCode === validation.data?.memberId);
    if (member) {
      // Check if already checked in today
      const alreadyCheckedIn = todayAttendance.find(a => a.memberId === member.qrCode);
      if (alreadyCheckedIn) {
        showToast(`❌ ${member.fullName} already checked in today at ${alreadyCheckedIn.checkInTime.toLocaleTimeString()}`, 'error');
        setQrInput('');
        return;
      }

      // Check membership status
      if (member.membershipStatus !== 'Active') {
        showToast(`❌ ${member.fullName}'s membership is ${member.membershipStatus}. Cannot check in.`, 'error');
        setQrInput('');
        return;
      }

      // Check if membership expired
      const today = new Date();
      const expiryDate = new Date(member.expiryDate);
      if (today > expiryDate) {
        showToast(`❌ ${member.fullName}'s membership expired on ${expiryDate.toLocaleDateString()}`, 'error');
        setQrInput('');
        return;
      }

      // All checks passed - proceed with check-in
      const newRecord: AttendanceRecord = {
        id: Date.now().toString(),
        memberId: member.qrCode,
        memberName: member.fullName,
        checkInTime: new Date(),
        method: 'qr',
      };
      setTodayAttendance([newRecord, ...todayAttendance]);
      setQrInput('');
      
      // Mark QR as used for today
      const todayStr = new Date().toDateString();
      localStorage.setItem('qr_last_used', JSON.stringify({
        date: todayStr,
        memberId: member.qrCode,
        timestamp: Date.now()
      }));
      
      showToast(`✅ ${member.fullName} checked in successfully!`, 'success');
    } else {
      showToast('❌ Invalid QR code. Member not found.', 'error');
    }
  };

  const handleManualCheckIn = (member: typeof gymMembers[0]) => {
    // Check if already checked in today
    const alreadyCheckedIn = todayAttendance.find(a => a.memberId === member.qrCode);
    if (alreadyCheckedIn) {
      showToast(`❌ ${member.fullName} already checked in today at ${alreadyCheckedIn.checkInTime.toLocaleTimeString()}`, 'error');
      return;
    }

    // Check membership status
    if (member.membershipStatus !== 'Active') {
      showToast(`❌ ${member.fullName}'s membership is ${member.membershipStatus}. Cannot check in.`, 'error');
      return;
    }

    // Check if membership expired
    const today = new Date();
    const expiryDate = new Date(member.expiryDate);
    if (today > expiryDate) {
      showToast(`❌ ${member.fullName}'s membership expired on ${expiryDate.toLocaleDateString()}`, 'error');
      return;
    }

    // All checks passed - proceed with check-in
    const newRecord: AttendanceRecord = {
      id: Date.now().toString(),
      memberId: member.qrCode,
      memberName: member.fullName,
      checkInTime: new Date(),
      method: 'manual',
    };
    setTodayAttendance([newRecord, ...todayAttendance]);
    setSearchTerm('');
    showToast(`✅ ${member.fullName} checked in manually!`, 'success');
  };

  const filteredMembers = gymMembers.filter(m =>
    m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.qrCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = [
    { label: 'Today\'s Check-ins', value: todayAttendance.length, icon: UserCheck, color: 'from-green-500 to-emerald-500' },
    { label: 'QR Scans', value: todayAttendance.filter(a => a.method === 'qr').length, icon: QrCode, color: 'from-blue-500 to-cyan-500' },
    { label: 'Manual Check-ins', value: todayAttendance.filter(a => a.method === 'manual').length, icon: Search, color: 'from-purple-500 to-pink-500' },
    { label: 'Attendance Rate', value: `${Math.round((todayAttendance.length / gymMembers.length) * 100)}%`, icon: TrendingUp, color: 'from-primary-start to-primary-end' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-orbitron font-bold text-gradient">Attendance</h1>
        <p className="text-gray-400 mt-1">Hybrid check-in system: QR scan or manual entry</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${stat.color} p-6 shadow-lg`}>
                <div className="relative z-10">
                  <Icon size={24} className="text-white mb-2" />
                  <p className="text-white/80 text-sm font-medium">{stat.label}</p>
                  <p className="text-3xl font-bold text-white mt-2 font-orbitron">{stat.value}</p>
                </div>
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Check-in Methods */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('scan')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'scan'
                  ? 'bg-gradient-to-r from-primary-start to-primary-end text-white shadow-lg'
                  : 'bg-dark border border-dark-border text-gray-400 hover:text-white'
              }`}
            >
              <QrCode size={20} />
              QR Code Scan
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'manual'
                  ? 'bg-gradient-to-r from-primary-start to-primary-end text-white shadow-lg'
                  : 'bg-dark border border-dark-border text-gray-400 hover:text-white'
              }`}
            >
              <Search size={20} />
              Manual Check-in
            </button>
          </div>

          {/* QR Scan Tab */}
          {activeTab === 'scan' && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="bg-dark rounded-2xl p-8 text-center border-2 border-dashed border-dark-border">
                <QrCode size={64} className="text-primary-start mx-auto mb-4" />
                <h3 className="text-white font-semibold text-lg mb-2">Scan Member QR Code</h3>
                <p className="text-gray-400 text-sm mb-6">Use camera to scan or enter QR code manually</p>
                
                <div className="max-w-md mx-auto space-y-3">
                  {/* Camera Scanner Button */}
                  <Button
                    onClick={() => setIsScannerOpen(true)}
                    variant="primary"
                    className="w-full shadow-lg shadow-primary-start/30 flex items-center justify-center gap-2"
                  >
                    <Camera size={20} />
                    Open Camera Scanner
                  </Button>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-dark-border"></div>
                    <span className="text-gray-500 text-xs">OR</span>
                    <div className="flex-1 h-px bg-dark-border"></div>
                  </div>

                  {/* Manual Input */}
                  <Input
                    type="text"
                    placeholder="Enter QR code manually (e.g., GF-2024-001)"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleQRCheckIn()}
                    className="mb-3"
                  />
                  <Button
                    onClick={() => handleQRCheckIn()}
                    variant="ghost"
                    className="w-full"
                  >
                    Check In with Manual Entry
                  </Button>
                </div>
              </div>

              <div className="bg-dark-border/30 rounded-xl p-4">
                <p className="text-gray-400 text-sm">
                  <strong className="text-white">💡 Tip:</strong> Members can show their QR code from the mobile app Home screen. 
                  Use the camera scanner for quick check-ins, or type the member ID manually if needed.
                </p>
              </div>
            </motion.div>
          )}

          {/* Manual Check-in Tab */}
          {activeTab === 'manual' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="relative">
                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search member by name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-12"
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 bg-dark rounded-xl hover:bg-dark-border transition-all duration-200 border border-transparent hover:border-primary-start/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center text-white font-bold shadow-lg">
                          {member.firstName[0]}{member.lastName[0]}
                        </div>
                        <div>
                          <p className="text-white font-semibold">{member.fullName}</p>
                          <p className="text-gray-400 text-sm">{member.qrCode} • {member.membershipType}</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleManualCheckIn(member)}
                        variant="primary"
                        className="shadow-lg shadow-primary-start/30"
                      >
                        Check In
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-400">No members found</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </Card>
      </motion.div>

      {/* Today's Attendance Log */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-primary-start" />
              <h3 className="font-semibold text-white text-lg">Today's Attendance Log</h3>
            </div>
            <span className="text-xs text-gray-400 bg-dark-border px-3 py-1 rounded-full">
              {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        }>
          <div className="space-y-3">
            {todayAttendance.length > 0 ? (
              todayAttendance.map((record) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between p-4 bg-dark rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      {record.method === 'qr' ? <QrCode size={20} className="text-white" /> : <UserCheck size={20} className="text-white" />}
                    </div>
                    <div>
                      <p className="text-white font-semibold">{record.memberName}</p>
                      <p className="text-gray-400 text-sm">{record.memberId}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock size={14} className="text-gray-400" />
                      <p className="text-white text-sm font-medium">
                        {record.checkInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <Badge variant={record.method === 'qr' ? 'Premium' : 'Standard'}>
                      {record.method === 'qr' ? 'QR Scan' : 'Manual'}
                    </Badge>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8">
                <UserCheck size={48} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No check-ins yet today</p>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(qrCode) => handleQRCheckIn(qrCode)}
      />
    </div>
  );
}
