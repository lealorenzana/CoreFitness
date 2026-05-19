// Export utilities for generating CSV and PDF reports

export const exportToCSV = (data: any[], filename: string) => {
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
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportMembersToCSV = (members: any[]) => {
  const exportData = members.map(member => ({
    'Member ID': member.qrCode,
    'Full Name': member.fullName,
    'Email': member.email,
    'Phone': member.phone,
    'Address': member.address,
    'Membership Type': member.membershipType,
    'Status': member.membershipStatus,
    'Join Date': member.joinDate,
    'Expiry Date': member.expiryDate,
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

export const exportAttendanceToCSV = (attendance: any[]) => {
  const exportData = attendance.map(record => ({
    'Date': record.date,
    'Time': record.time,
    'Member Name': record.memberName,
    'Member ID': record.memberId,
    'Method': record.method,
  }));

  exportToCSV(exportData, 'attendance_report');
};

export const exportRevenueToCSV = (revenueData: any[]) => {
  const exportData = revenueData.map(record => ({
    'Month': record.month,
    'Revenue': `₱${record.revenue.toLocaleString()}`,
    'Members': record.members,
    'Growth': record.growth,
  }));

  exportToCSV(exportData, 'revenue_report');
};

// Mock PDF generation (shows success message)
export const generatePDFReport = (reportType: string) => {
  // In production, this would use jsPDF or similar library
  alert(`PDF Report Generated!\n\nReport Type: ${reportType}\nDate: ${new Date().toLocaleDateString()}\n\nIn production, this would download a PDF file.`);
  
  // Simulate download delay
  return new Promise((resolve) => {
    setTimeout(resolve, 500);
  });
};
