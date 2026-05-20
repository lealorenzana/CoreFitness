// Centralized error handling and user feedback

export type ErrorType = 'network' | 'validation' | 'auth' | 'server' | 'unknown';

export interface AppError {
  type: ErrorType;
  message: string;
  details?: string;
  code?: string;
}

export const handleError = (error: any): AppError => {
  // Network errors
  if (error.message === 'Network Error' || !navigator.onLine) {
    return {
      type: 'network',
      message: 'No internet connection',
      details: 'Please check your internet connection and try again'
    };
  }
  
  // Authentication errors
  if (error.status === 401 || error.status === 403) {
    return {
      type: 'auth',
      message: 'Authentication failed',
      details: 'Please log in again',
      code: error.status.toString()
    };
  }
  
  // Validation errors
  if (error.status === 400) {
    return {
      type: 'validation',
      message: 'Invalid input',
      details: error.message || 'Please check your input and try again',
      code: '400'
    };
  }
  
  // Server errors
  if (error.status >= 500) {
    return {
      type: 'server',
      message: 'Server error',
      details: 'Something went wrong on our end. Please try again later',
      code: error.status.toString()
    };
  }
  
  // Unknown errors
  return {
    type: 'unknown',
    message: 'Something went wrong',
    details: error.message || 'An unexpected error occurred'
  };
};

export const showErrorToast = (error: AppError) => {
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 right-4 z-[9999] px-6 py-4 rounded-xl shadow-2xl bg-red-500 text-white flex items-center gap-3 animate-slide-in';
  
  toast.innerHTML = `
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
    </svg>
    <div>
      <p class="font-semibold">${error.message}</p>
      ${error.details ? `<p class="text-sm opacity-90">${error.details}</p>` : ''}
    </div>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transform = 'translateX(400px)';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 5000);
};

export const showSuccessToast = (message: string) => {
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 right-4 z-[9999] px-6 py-4 rounded-xl shadow-2xl bg-green-500 text-white flex items-center gap-3 animate-slide-in';
  
  toast.innerHTML = `
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
    </svg>
    <p class="font-semibold">${message}</p>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transform = 'translateX(400px)';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
};

// Loading state manager
export class LoadingManager {
  private static loadingCount = 0;
  
  static show() {
    this.loadingCount++;
    if (this.loadingCount === 1) {
      const loader = document.createElement('div');
      loader.id = 'global-loader';
      loader.className = 'fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center';
      loader.innerHTML = `
        <div class="bg-dark-lighter p-8 rounded-2xl shadow-2xl">
          <div class="w-16 h-16 border-4 border-primary-start border-t-transparent rounded-full animate-spin"></div>
          <p class="text-white mt-4 font-semibold">Loading...</p>
        </div>
      `;
      document.body.appendChild(loader);
    }
  }
  
  static hide() {
    this.loadingCount = Math.max(0, this.loadingCount - 1);
    if (this.loadingCount === 0) {
      const loader = document.getElementById('global-loader');
      if (loader) {
        document.body.removeChild(loader);
      }
    }
  }
}

// Defense Points:
// ✅ Centralized error handling
// ✅ User-friendly error messages
// ✅ Network error detection
// ✅ Loading state management
// ✅ Toast notifications
// 
// Production Enhancements:
// - Error logging to monitoring service (Sentry)
// - Error analytics and tracking
// - Retry mechanism for failed requests
// - Offline queue for failed operations
// - Error reporting to admin dashboard
