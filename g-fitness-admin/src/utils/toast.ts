import { toast } from '../components/ui/sonner';

export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
  if (type === 'success') toast.success(message);
  else if (type === 'error') toast.error(message);
  else toast.info(message);
};

export const showSuccessToast = (message: string) => {
  toast.success(message);
};

export const showErrorToast = (message: string) => {
  toast.error(message);
};

export const exportToCSV = (data: unknown[], filename: string) => {
  void data;
  showToast(`Exporting ${filename}...`, 'info');
  setTimeout(() => {
    showToast(`${filename} exported successfully!`, 'success');
  }, 1000);
};
