import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import QRScanner from '../components/ui/QRScanner';
import { useGymContext } from '../hooks/useGymContext';
import { MEMBERS } from '../data/members';
import { QrCode, UserCheck, Search, Calendar, Clock, TrendingUp, Camera } from 'lucide-react';
import { showToast } from '../utils/toast';

const ITEMS_PER_PAGE = 10;

const validateQR = (qrCode: string) => {
  try {
    const decoded = atob(qrCode);
    const qrData = JSON.parse(decoded);
    const now = Date.now();
    const expirationTime = qrData.timestamp + (qrData.expiresIn * 1000);
    if (now > expirationTime) return { valid: false, reason: 'QR Code expired', data: null };
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
  const gymMembers = MEMBERS.filter((m) => m.gymId === selectedGym.id);

  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>('scan');
  const [qrInput, setQrInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [logDate, setLogDate] = useState<string>(new Date().toDateString());
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [logPage, setLogPage] = useState(1);

  // Per-day attendance, keyed by gym + date string
  const storageKey = (date: string) => `attendance_${selectedGym.id}_${date}`;

  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>(() => {
    const today = new Date().toDateString();
    const saved = localStorage.getItem(storageKey(today));
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((r: any) => ({ ...r, checkInTime: new Date(r.checkInTime) }));
    }
    return [
      { id: '1', memberId: 'GF-2024-001', memberName: 'Eya Lorenzana', checkInTime: new Date(Date.now() - 30 * 60_000), method: 'qr' },
      { id: '2', memberId: 'GF-2024-002', memberName: 'Maria Santos',  checkInTime: new Date(Date.now() - 45 * 60_000), method: 'manual' },
    ];
  });

  // Load attendance for the selected log date
  const [logRecords, setLogRecords] = useState<AttendanceRecord[]>([]);
  useEffect(() => {
    const saved = localStorage.getItem(storageKey(logDate));
    if (saved) {
      const parsed = JSON.parse(saved);
      setLogRecords(parsed.map((r: any) => ({ ...r, checkInTime: new Date(r.checkInTime) })));
    } else if (logDate === new Date().toDateString()) {
      setLogRecords(todayAttendance);
    } else {
      setLogRecords([]);
    }
    setLogPage(1);
  }, [logDate, todayAttendance, selectedGym.id]);

  // Persist today's attendance
  useEffect(() => {
    const today = new Date().toDateString();
    localStorage.setItem(storageKey(today), JSON.stringify(todayAttendance));
  }, [todayAttendance, selectedGym.id]);

  // Total visits per member (across all-time storage on this gym)
  const visitCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Iterate localStorage keys for this gym
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(`attendance_${selectedGym.id}_`)) continue;
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        arr.forEach((r: any) => { counts[r.memberId] = (counts[r.memberId] || 0) + 1; });
      } catch { /* ignore */ }
    }
    return counts;
  }, [selectedGym.id, todayAttendance]);

  const handleQRCheckIn = (qrCodeValue?: string) => {
    const qr = qrCodeValue || qrInput.trim();
    if (!qr) return showToast('Please enter a QR code', 'error');

    const validation = validateQR(qr);
    if (!validation.valid) return showToast(`X ${validation.reason}`, 'error');

    const member = gymMembers.find((m) => m.qrCode === validation.data?.memberId);
    if (!member) return showToast('X Invalid QR code. Member not found.', 'error');

    if (todayAttendance.find((a) => a.memberId === member.qrCode))
      return showToast(`X ${member.fullName} already checked in today`, 'error');

    if (member.membershipStatus !== 'Active')
      return showToast(`X ${member.fullName}'s membership is ${member.membershipStatus}`, 'error');

    if (new Date() > new Date(member.expiryDate))
      return showToast(`X ${member.fullName}'s membership expired`, 'error');

    const newRecord: AttendanceRecord = {
      id: Date.now().toString(),
      memberId: member.qrCode,
      memberName: member.fullName,
      checkInTime: new Date(),
      method: 'qr',
    };
    setTodayAttendance([newRecord, ...todayAttendance]);
    setQrInput('');
    showToast(`OK ${member.fullName} checked in successfully!`, 'success');
  };

  const handleManualCheckIn = (member: typeof gymMembers[0]) => {
    if (todayAttendance.find((a) => a.memberId === member.qrCode))
      return showToast(`X ${member.fullName} already checked in today`, 'error');
    if (member.membershipStatus !== 'Active')
      return showToast(`X ${member.fullName}'s membership is ${member.membershipStatus}`, 'error');
    if (new Date() > new Date(member.expiryDate))
      return showToast(`X ${member.fullName}'s membership expired`, 'error');

    const newRecord: AttendanceRecord = {
      id: Date.now().toString(),
      memberId: member.qrCode,
      memberName: member.fullName,
      checkInTime: new Date(),
      method: 'manual',
    };
    setTodayAttendance([newRecord, ...todayAttendance]);
    setSearchTerm('');
    showToast(`OK ${member.fullName} checked in manually!`, 'success');
  };

  const filteredMembers = gymMembers.filter((m) =>
    m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.qrCode.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredLog = logRecords.filter((r) =>
    r.memberName.toLowerCase().includes(logSearch.toLowerCase()) ||
    r.memberId.toLowerCase().includes(logSearch.toLowerCase()),
  );

  const stats = [
    { label: "Today's Check-ins",  value: todayAttendance.length,                                           icon: UserCheck,  color: 'var(--color-primary)' },
    { label: 'QR Scans',           value: todayAttendance.filter((a) => a.method === 'qr').length,         icon: QrCode,     color: 'var(--color-primary)' },
    { label: 'Manual Check-ins',   value: todayAttendance.filter((a) => a.method === 'manual').length,     icon: Search,     color: 'var(--color-primary)' },
    { label: 'Attendance Rate',    value: `${gymMembers.length ? Math.round((todayAttendance.length / gymMembers.length) * 100) : 0}%`, icon: TrendingUp, color: 'var(--color-secondary)' },
  ];

  const dateInputValue = (() => {
    const d = new Date(logDate);
    return d.toISOString().split('T')[0];
  })();

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden" style={{ maxHeight: 'calc(100vh - 5rem)' }}>
      {/* Header + Stats row */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Attendance</h1>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Hybrid check-in: QR scan or manual entry</p>
        </div>
        <div className="flex items-center gap-2">
          {stats.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                <Icon size={12} style={{ color: s.color }} />
                <span className="text-[9px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
                <span className="text-sm font-bold text-white">{s.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Three-column layout */}
      <div className="flex-1 min-h-0 grid grid-cols-3 gap-3">
        {/* COL 1: QR Code Scan */}
        <div className="rounded-xl overflow-hidden flex flex-col"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="p-2.5 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <QrCode size={13} style={{ color: 'var(--color-secondary)' }} />
            <h3 className="text-[11px] font-semibold text-white">QR Code Scan</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col items-center justify-center text-center space-y-3">
            <QrCode size={36} style={{ color: 'var(--color-secondary)' }} />
            <div>
              <h3 className="text-white font-semibold text-xs">Scan Member QR</h3>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Use camera or enter code</p>
            </div>
            <Button onClick={() => setIsScannerOpen(true)} variant="primary" size="sm"
              className="w-full flex items-center justify-center gap-1.5 !text-[10px]">
              <Camera size={12} /> Open Camera
            </Button>
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
              <span className="text-[8px]" style={{ color: 'var(--color-text-muted)' }}>OR</span>
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            </div>
            <div className="w-full space-y-1.5">
              <input type="text" placeholder="Enter QR code (e.g., GF-2024-001)"
                value={qrInput} onChange={(e) => setQrInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQRCheckIn()}
                className="w-full px-3 py-2 rounded-xl text-[11px] text-white focus:outline-none"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
              <Button onClick={() => handleQRCheckIn()} variant="ghost" size="sm" className="w-full !text-[10px]">
                Check In
              </Button>
            </div>
          </div>
        </div>

        {/* COL 2: Manual Check-in */}
        <div className="rounded-xl overflow-hidden flex flex-col"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="p-2.5 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <Search size={13} style={{ color: 'var(--color-primary)' }} />
            <h3 className="text-[11px] font-semibold text-white">Manual Check-in</h3>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col p-3">
            <div className="relative flex-shrink-0 mb-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input type="text" placeholder="Search member..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 rounded-xl text-[11px] text-white focus:outline-none"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }} />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-dark-border">
              {filteredMembers.length > 0 ? filteredMembers.slice(0, 20).map(member => (
                <div key={member.id} className="flex items-center justify-between p-2 rounded-lg"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-black font-bold text-[8px] flex-shrink-0"
                      style={{ background: 'var(--color-secondary)' }}>
                      {member.firstName[0]}{member.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-white font-semibold truncate">{member.fullName}</p>
                      <p className="text-[8px] truncate" style={{ color: 'var(--color-text-muted)' }}>{member.qrCode}</p>
                    </div>
                  </div>
                  <Button onClick={() => handleManualCheckIn(member)} variant="primary" size="sm" className="!text-[9px] !px-2 !py-1 !h-6">
                    Check In
                  </Button>
                </div>
              )) : (
                <div className="text-center py-4 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>No members found</div>
              )}
            </div>
          </div>
        </div>

        {/* COL 3: Attendance Log */}
        <div className="rounded-xl overflow-hidden flex flex-col"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between p-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <Calendar size={13} style={{ color: 'var(--color-secondary)' }} />
              <h3 className="text-[11px] font-semibold text-white">Attendance Log</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateInputValue}
                onChange={(e) => setLogDate(new Date(e.target.value).toDateString())}
                className="px-1.5 py-1 rounded-lg text-[9px] focus:outline-none"
                style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }} />
              <div className="relative">
                <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
                <input value={logSearch} onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-6 pr-2 py-1 rounded-lg text-[9px] w-20 focus:outline-none"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: '#fff' }} />
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-dark-border">
            {filteredLog.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-6">
                <UserCheck size={24} style={{ color: 'var(--color-border)' }} className="mb-1" />
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>No check-ins</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0" style={{ background: 'var(--color-surface)' }}>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Member', 'Time', 'Method'].map(h => (
                      <th key={h} className="text-left py-1.5 px-2 text-[8px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.slice((logPage - 1) * ITEMS_PER_PAGE, logPage * ITEMS_PER_PAGE).map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td className="py-1.5 px-2">
                        <p className="text-[10px] text-white font-semibold truncate">{r.memberName}</p>
                      </td>
                      <td className="py-1.5 px-2 text-[9px]" style={{ color: 'var(--color-text-secondary)' }}>
                        {r.checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-1.5 px-2">
                        <Badge variant={r.method === 'qr' ? 'QR' : 'Manual'}>
                          {r.method === 'qr' ? 'QR' : 'Manual'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {filteredLog.length > 0 && (
            <div className="flex-shrink-0 px-2 py-1" style={{ borderTop: '1px solid var(--color-border)' }}>
              <Pagination currentPage={logPage} totalItems={filteredLog.length}
                itemsPerPage={ITEMS_PER_PAGE} onPageChange={setLogPage} />
            </div>
          )}
        </div>
      </div>

      <QRScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(qrCode) => handleQRCheckIn(qrCode)}
      />
    </div>
  );
}
