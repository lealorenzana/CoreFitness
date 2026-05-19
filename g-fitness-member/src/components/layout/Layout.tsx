import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import BottomNav from './BottomNav';

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);

  // Scroll to top when route changes
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center p-4">
      <div className="relative w-full max-w-[375px] h-[812px] rounded-[3rem] overflow-hidden">
        {/* Outer Phone Bezel - Metallic Frame with subtle light glow */}
        <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-br from-gray-600 via-gray-700 to-gray-800 p-[3px] shadow-[0_0_40px_rgba(255,255,255,0.1),0_0_80px_rgba(249,115,22,0.25),0_20px_60px_rgba(0,0,0,0.8)]">
          {/* Inner Screen Container */}
          <div className="relative w-full h-full bg-black rounded-[2.7rem] overflow-hidden">
            {/* Status Bar Area */}
            <div className="absolute top-0 left-0 right-0 h-11 bg-gradient-to-b from-gray-900/50 to-transparent z-50 px-6 flex items-center justify-between text-white text-sm">
              <span className="font-semibold">9:41</span>
              <div className="flex items-center gap-1">
                {/* Signal Icon */}
                <svg className="w-4 h-3" viewBox="0 0 16 12" fill="white">
                  <rect x="0" y="8" width="2" height="4" rx="0.5"/>
                  <rect x="3.5" y="5" width="2" height="7" rx="0.5"/>
                  <rect x="7" y="2" width="2" height="10" rx="0.5"/>
                  <rect x="10.5" y="0" width="2" height="12" rx="0.5"/>
                </svg>
                {/* WiFi Icon */}
                <svg className="w-4 h-3 ml-1" viewBox="0 0 16 12" fill="white">
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
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-3xl z-50 shadow-lg">
              {/* Camera */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 rounded-full border border-gray-700"></div>
            </div>
            
            {/* Screen Content */}
            <div id="phone-screen" className="h-full flex flex-col pt-8 relative bg-black">
              <main ref={mainRef} className="flex-1 overflow-y-auto px-4 py-6 pb-6 scrollbar-hide relative bg-black">
                <Outlet />
              </main>
              
              {/* Bottom Nav */}
              <BottomNav />
              
              {/* Modal Portal Container */}
              <div id="modal-root" className="absolute inset-0 pointer-events-none" style={{ zIndex: 9999 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
