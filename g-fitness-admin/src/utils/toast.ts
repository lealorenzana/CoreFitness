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

// A fake `exportToCSV` lived here: it took the data, threw it away (`void data`),
// toasted "Exporting…", waited a second and toasted "exported successfully!".
// Retention and Revenue both imported *this* one rather than the real
// implementation in `exportUtils.ts`, so their Export buttons announced success
// and produced no file. Deleted so the name cannot be picked up by accident again.
