// Centralized error handling and user feedback

export type ErrorType = 'network' | 'validation' | 'auth' | 'server' | 'unknown';

export interface AppError {
  type: ErrorType;
  message: string;
  details?: string;
  code?: string;
}

export const handleError = (thrown: unknown): AppError => {
  const error = (thrown ?? {}) as { message?: string; status?: number };
  if (error.message === 'Network Error' || !navigator.onLine) {
    return {
      type: 'network',
      message: 'No internet connection',
      details: 'Please check your internet connection and try again',
    };
  }

  if (error.status === 401 || error.status === 403) {
    return {
      type: 'auth',
      message: 'Authentication failed',
      details: 'Please log in again',
      code: String(error.status),
    };
  }

  if (error.status === 400) {
    return {
      type: 'validation',
      message: 'Invalid input',
      details: error.message || 'Please check your input and try again',
      code: '400',
    };
  }

  if ((error.status ?? 0) >= 500) {
    return {
      type: 'server',
      message: 'Server error',
      details: 'Something went wrong on our end. Please try again later',
      code: String(error.status),
    };
  }

  return {
    type: 'unknown',
    message: 'Something went wrong',
    details: error.message || 'An unexpected error occurred',
  };
};

function getToastRoot(): HTMLElement {
  return (
    document.getElementById('phone-toast-root') ??
    document.getElementById('phone-screen') ??
    document.body
  );
}

function getOverlayRoot(): HTMLElement | null {
  return document.getElementById('phone-overlay-root') ?? document.getElementById('phone-screen');
}

function appendToast(toast: HTMLDivElement) {
  const root = getToastRoot();
  root.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export const showErrorToast = (error: AppError) => {
  const toast = document.createElement('div');
  toast.className =
    'phone-toast relative z-[200] mx-2 mt-2 px-4 py-3 rounded-xl shadow-lg bg-red-500 text-white flex items-start gap-2 text-sm pointer-events-auto';

  toast.innerHTML = `
    <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
    </svg>
    <div class="min-w-0"></div>
  `;
  // The words go in as TEXT, never as HTML (audit, 2026-11-15): an error message can carry what a server, a
  // sign-in provider or the address bar said, and none of that may become markup on the sign-in pages.
  const words = toast.querySelector('div') as HTMLDivElement;
  const head = document.createElement('p');
  head.className = 'font-semibold leading-tight';
  head.textContent = error.message;
  words.appendChild(head);
  if (error.details) {
    const more = document.createElement('p');
    more.className = 'text-xs opacity-90 mt-0.5';
    more.textContent = error.details;
    words.appendChild(more);
  }

  appendToast(toast);
};

export const showSuccessToast = (message: string) => {
  const toast = document.createElement('div');
  toast.className =
    'phone-toast relative z-[200] mx-2 mt-2 px-4 py-3 rounded-xl shadow-lg bg-green-600 text-white flex items-center gap-2 text-sm pointer-events-auto';

  toast.innerHTML = `
    <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
    </svg>
    <p class="font-semibold leading-tight"></p>
  `;
  (toast.querySelector('p') as HTMLParagraphElement).textContent = message;   // text, never HTML

  appendToast(toast);
};

export class LoadingManager {
  private static loadingCount = 0;

  static show() {
    this.loadingCount++;
    if (this.loadingCount === 1) {
      const host = getOverlayRoot();
      if (!host) return;

      const loader = document.createElement('div');
      loader.id = 'global-loader';
      loader.className =
        'absolute inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center pointer-events-auto';
      loader.innerHTML = `
        <div class="bg-gray-900 border border-gray-700 p-6 rounded-2xl shadow-2xl text-center">
          <div class="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p class="text-white mt-3 font-semibold text-sm">Loading...</p>
        </div>
      `;
      host.appendChild(loader);
    }
  }

  static hide() {
    this.loadingCount = Math.max(0, this.loadingCount - 1);
    if (this.loadingCount === 0) {
      document.getElementById('global-loader')?.remove();
    }
  }
}
