import { ReactNode } from 'react';

interface MobileFrameProps {
  children: ReactNode;
}

export default function MobileFrame({ children }: MobileFrameProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center p-4">
      <div className="relative w-full max-w-[375px] h-[812px] rounded-[3rem] overflow-hidden">
        {/* Outer Phone Bezel - Dark metallic frame like real phone */}
        <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 p-[8px] shadow-[0_0_20px_rgba(120,120,120,0.25),0_0_40px_rgba(120,120,120,0.15),0_30px_80px_rgba(0,0,0,0.9)]">
          {/* Inner Screen Container */}
          <div className="relative w-full h-full bg-black rounded-[2.7rem] overflow-hidden">
            {/* Status Bar Area */}
            <div className="absolute top-0 left-0 right-0 h-11 bg-transparent z-50 px-8 flex items-center justify-between text-white text-sm pt-2">
              <span className="font-semibold">9:41</span>
              <div className="flex items-center gap-1.5">
                {/* WiFi Icon */}
                <svg className="w-4 h-3" viewBox="0 0 16 12" fill="white">
                  <path d="M8 12C8.73638 12 9.33333 11.403 9.33333 10.6667C9.33333 9.93029 8.73638 9.33333 8 9.33333C7.26362 9.33333 6.66667 9.93029 6.66667 10.6667C6.66667 11.403 7.26362 12 8 12Z"/>
                  <path d="M8 7.33333C9.28866 7.33333 10.4983 7.84583 11.4 8.66667L12.6667 7.13333C11.3817 5.97917 9.75167 5.33333 8 5.33333C6.24833 5.33333 4.61833 5.97917 3.33333 7.13333L4.6 8.66667C5.50167 7.84583 6.71134 7.33333 8 7.33333Z"/>
                  <path d="M8 2.66667C10.2092 2.66667 12.2742 3.48583 13.8667 4.93333L15.1333 3.4C13.1583 1.59583 10.6667 0.666667 8 0.666667C5.33333 0.666667 2.84167 1.59583 0.866667 3.4L2.13333 4.93333C3.72583 3.48583 5.79083 2.66667 8 2.66667Z"/>
                </svg>
                {/* Battery Icon */}
                <svg className="w-6 h-3 ml-1" viewBox="0 0 24 12" fill="white">
                  <rect x="0" y="1" width="18" height="10" rx="2" stroke="white" strokeWidth="1" fill="none"/>
                  <rect x="2" y="3" width="14" height="6" rx="1" fill="white"/>
                  <rect x="18.5" y="4" width="2" height="4" rx="1" fill="white"/>
                </svg>
              </div>
            </div>
            
            {/* Phone Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 rounded-b-3xl z-50 shadow-lg bg-gradient-to-b from-gray-700 to-gray-800">
              {/* Camera */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-950 rounded-full border border-gray-800"></div>
            </div>
            
            {/* Screen Content */}
            <div className="relative h-full" style={{ backgroundColor: '#0d0d0d' }}>
              <div className="h-full overflow-y-auto pt-8 scrollbar-hide" style={{ backgroundColor: '#0d0d0d' }}>
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
