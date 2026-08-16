// Export utilities for generating CSV reports.
import { todayKey } from './dates';

/**
 * @param stampDate append today's date to the filename. Pass `false` when the
 *   caller has already put the relevant date in the name — otherwise exporting
 *   last Tuesday's attendance produces `attendance_2026-08-11_2026-08-16.csv`.
 */
export const exportToCSV = (data: any[], filename: string, stampDate = true) => {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV content
  const csvContent = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Handle values with commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  // `todayKey()`, not `toISOString()` — the latter is UTC, so a file exported at
  // 7am in Manila was stamped with yesterday's date.
  link.setAttribute('download', stampDate ? `${filename}_${todayKey()}.csv` : `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * The roster, as the roster actually is.
 *
 * This used to read `member.membershipType` and `member.joinDate`, neither of
 * which has existed on the row shape since it was migrated to Supabase — so two
 * columns exported blank for every member, every time, and nothing said so. The
 * `as never[]` cast at the call site is what kept TypeScript quiet about it.
 */
export interface MemberCsvRow {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  dateOfBirth: string;
  gender: string;
  experienceLevel: string;
  accountStatus: string;
  planName: string;
  membershipStatus: string | null;
  expiryDate: string | null;
  neverExpires: boolean;
  joinedOn: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  checkInCode: string;
}

export const exportMembersToCSV = (members: MemberCsvRow[]) => {
  const exportData = members.map(member => ({
    'Check-in Code': member.checkInCode,
    'Full Name': member.fullName,
    'Email': member.email,
    'Phone': member.phone,
    'Address': member.address,
    'Date of Birth': member.dateOfBirth,
    'Gender': member.gender,
    'Experience Level': member.experienceLevel,
    'Account Status': member.accountStatus,
    'Plan': member.planName,
    'Membership Status': member.membershipStatus ?? 'none',
    // A blank expiry means two different things (0024), so the export spells
    // out which one rather than exporting an ambiguous empty cell.
    'Expiry Date': member.expiryDate ?? (member.neverExpires ? 'never expires' : 'not activated'),
    'Joined': member.joinedOn.slice(0, 10),
    'Emergency Contact': member.emergencyContactName,
    'Emergency Phone': member.emergencyContactPhone,
    'Emergency Relationship': member.emergencyContactRelationship,
  }));

  exportToCSV(exportData, 'members_report');
};

export const exportPaymentsToCSV = (payments: any[]) => {
  const exportData = payments.map(payment => ({
    'Invoice': payment.invoiceNumber,
    'Member Name': payment.memberName,
    'Member ID': payment.memberId,
    'Amount': `₱${payment.amount.toLocaleString()}`,
    'Plan': payment.plan,
    'Method': payment.method,
    'Date': payment.date,
    'Due Date': payment.dueDate,
    'Status': payment.status,
  }));

  exportToCSV(exportData, 'payments_report');
};

/* Deleted with them: `exportAttendanceToCSV` and `exportRevenueToCSV`, which read
   fields (`record.date`, `record.time`, `record.memberName`) that no current row
   shape carries — they would have written files of empty columns, exactly as the
   members export did. Attendance builds its own rows from `AttendanceRow` now.

   Also deleted: `generatePDFReport`, which alerted "In production, this would
   download a PDF file" and was wired to nothing. */
