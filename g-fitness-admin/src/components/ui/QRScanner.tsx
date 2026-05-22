import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { X, Camera, QrCode, AlertCircle } from 'lucide-react';
import Button from './Button';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (qrCode: string) => void;
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [hasCamera, setHasCamera] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [manualInput, setManualInput] = useState('');

  useEffect(() => {
    if (isOpen && isScanning) {
      startScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen, isScanning]);

  const startScanner = async () => {
    try {
      setError('');
      
      // Check if camera is available
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setHasCamera(false);
        setError('No camera found. Please use manual entry.');
        return;
      }

      // Initialize scanner
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      // Start scanning
      await scanner.start(
        { facingMode: 'environment' }, // Use back camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // QR code successfully scanned
          onScan(decodedText);
          stopScanner();
          onClose();
        },
        () => {
          // Scanning error (ignore, happens continuously)
        }
      );
    } catch (err: any) {
      console.error('Scanner error:', err);
      setHasCamera(false);
      setError('Unable to access camera. Please use manual entry.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const handleClose = () => {
    stopScanner();
    setIsScanning(false);
    setError('');
    setManualInput('');
    onClose();
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
      handleClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-dark-lighter border border-dark-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-dark-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                    <QrCode size={24} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Scan QR Code</h2>
                    <p className="text-gray-400 text-sm">Position QR code within frame</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {!isScanning ? (
                  // Start Screen
                  <div className="space-y-4">
                    <div className="bg-dark rounded-2xl p-8 text-center border-2 border-dashed border-dark-border">
                      <Camera size={64} className="text-primary-start mx-auto mb-4" />
                      <h3 className="text-white font-semibold text-lg mb-2">Ready to Scan</h3>
                      <p className="text-gray-400 text-sm mb-6">
                        Click the button below to activate your camera and scan member QR codes
                      </p>
                      <Button
                        onClick={() => setIsScanning(true)}
                        variant="primary"
                        className="w-full shadow-lg shadow-primary-start/30"
                      >
                        <Camera size={20} className="mr-2" />
                        Start Camera
                      </Button>
                    </div>

                    {/* Manual Entry Option */}
                    <div className="bg-dark-border/30 rounded-xl p-4">
                      <p className="text-gray-400 text-sm mb-3">
                        <strong className="text-white">Or enter manually:</strong>
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={manualInput}
                          onChange={(e) => setManualInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleManualSubmit()}
                          placeholder="Enter member ID (e.g., GF-2024-001)"
                          className="flex-1 bg-dark border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-start transition-colors"
                        />
                        <Button
                          onClick={handleManualSubmit}
                          variant="primary"
                          disabled={!manualInput.trim()}
                        >
                          Submit
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Scanner Screen
                  <div className="space-y-4">
                    {/* Scanner Container */}
                    <div className="relative bg-black rounded-2xl overflow-hidden">
                      <div id="qr-reader" className="w-full"></div>
                      
                      {/* Scanning Overlay */}
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 border-4 border-primary-start/50 rounded-2xl animate-pulse"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-4 border-primary-start rounded-2xl"></div>
                      </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle size={20} className="text-yellow flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-yellow text-sm font-semibold mb-1">Camera Error</p>
                          <p className="text-red-300 text-xs">{error}</p>
                        </div>
                      </div>
                    )}

                    {/* Instructions */}
                    {!error && (
                      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                        <p className="text-blue-300 text-sm font-semibold mb-2">📱 Scanning Tips:</p>
                        <ul className="text-blue-200 text-xs space-y-1 ml-4 list-disc">
                          <li>Hold the QR code steady within the frame</li>
                          <li>Ensure good lighting for best results</li>
                          <li>Keep the camera 6-12 inches from the QR code</li>
                          <li>Scanner will automatically detect and process</li>
                        </ul>
                      </div>
                    )}

                    {/* Manual Entry Fallback */}
                    {!hasCamera && (
                      <div className="bg-dark-border/30 rounded-xl p-4">
                        <p className="text-gray-400 text-sm mb-3">
                          <strong className="text-white">Enter manually instead:</strong>
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleManualSubmit()}
                            placeholder="Enter member ID"
                            className="flex-1 bg-dark border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-start transition-colors"
                          />
                          <Button
                            onClick={handleManualSubmit}
                            variant="primary"
                            disabled={!manualInput.trim()}
                          >
                            Submit
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Stop Button */}
                    <Button
                      onClick={() => {
                        stopScanner();
                        setIsScanning(false);
                        setError('');
                      }}
                      variant="ghost"
                      className="w-full"
                    >
                      Stop Camera
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
