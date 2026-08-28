import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { X, Camera, QrCode, AlertCircle } from 'lucide-react';
import Button from './Button';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (qrCode: string) => void;
}

/**
 * Release one scanner instance and its camera stream.
 *
 * `stop()` throws when `start()` never succeeded — a denied permission, a camera
 * already in use by Teams. That is the expected path on teardown after a failed
 * start, not an error worth logging: it would bury the real message above it.
 */
async function stopInstance(scanner: Html5Qrcode): Promise<void> {
  try {
    await scanner.stop();
  } catch {
    /* never started */
  }
  try {
    scanner.clear();
  } catch {
    /* nothing rendered */
  }
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [hasCamera, setHasCamera] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Serialises camera teardown against the next start. Switching cameras used to
  // construct a second Html5Qrcode on the same `qr-reader` element while the
  // first was still releasing its stream — the library then either refuses to
  // start ("scanner is already running") or leaves an orphaned <video> behind,
  // and the picker appears to do nothing. A laptop commonly exposes several
  // devices (built-in, external, and the virtual cameras Teams and OBS install),
  // so this path is reached more often than it looks.
  const teardownRef = useRef<Promise<void>>(Promise.resolve());
  const [manualInput, setManualInput] = useState('');
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraId, setCameraId] = useState('');

  // Step 1: find the cameras. The admin dashboard runs on a desktop, which has
  // only a front-facing webcam — the old `facingMode: 'environment'` constraint
  // asks for a rear camera that doesn't exist there. Enumerate instead and start
  // an explicit device, preferring a rear lens when the desk uses a tablet.
  useEffect(() => {
    if (!isOpen || !isScanning) return;
    let cancelled = false;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (cancelled) return;
        if (!devices || devices.length === 0) {
          setHasCamera(false);
          setError('No camera found. Please use manual entry.');
          return;
        }
        setHasCamera(true);
        setError('');
        setCameras(devices.map((d) => ({ id: d.id, label: d.label })));
        const rear = devices.find((d) => /back|rear|environment/i.test(d.label));
        setCameraId((current) => current || rear?.id || devices[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Camera enumeration failed:', err);
        setHasCamera(false);
        setError('Unable to access camera. Please allow camera permission, or use manual entry.');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isScanning]);

  // Step 2: run the scanner on the chosen device. Re-runs when the user picks a
  // different camera from the dropdown.
  useEffect(() => {
    if (!isOpen || !isScanning || !cameraId) return;
    let cancelled = false;

    let mine: Html5Qrcode | null = null;

    const startWhenFree = async () => {
      // Wait for the previous camera to actually let go before touching the DOM
      // node again. Without this the two overlap and the second start fails.
      await teardownRef.current;
      if (cancelled) return;

      const scanner = new Html5Qrcode('qr-reader', {
        verbose: false,
        // Only look for QR codes. Without this it also runs every 1D barcode
        // decoder on each frame, which costs time we'd rather spend on retries.
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        // Chrome's native BarcodeDetector is far more tolerant of glare and the
        // moiré you get pointing a webcam at another screen than the JS fallback.
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      mine = scanner;
      scannerRef.current = scanner;

      try {
        await scanner.start(
          cameraId,
          {
            fps: 10,
            // Crop to most of the viewfinder rather than a fixed 250px box: a
            // tight crop can clip the QR's quiet zone, which alone breaks decoding.
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8);
              return { width: size, height: size };
            },
            // Resolution belongs here, NOT in the first argument — html5-qrcode
            // rejects a `cameraIdOrConfig` object with more than one key. A webcam
            // otherwise defaults to ~640x480, where this QR's modules are only a
            // few pixels wide and the decode fails. When these constraints are
            // valid the library uses them in place of the first argument, so the
            // deviceId has to be repeated here.
            videoConstraints: {
              deviceId: { exact: cameraId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          (decodedText) => {
            onScan(decodedText);
            stopScanner();
            onClose();
          },
          () => {
            // Per-frame decode misses fire constantly while aiming — not an error.
          }
        );
        if (cancelled) return;
        // A camera that started is a camera that works — clear the failure left
        // by a previous device so the error box does not outlive the problem.
        setError('');
        setHasCamera(true);
      } catch (err) {
        if (cancelled) return;
        console.error('Scanner error:', err);
        setHasCamera(false);
        setError('Unable to start that camera. Try another, or use manual entry.');
      }
    };

    const running = startWhenFree();

    return () => {
      cancelled = true;
      // Hand the next start something to wait on, rather than tearing down in
      // the background and hoping it finishes first.
      teardownRef.current = running
        .then(() => (mine ? stopInstance(mine) : undefined))
        .catch(() => undefined);
      if (scannerRef.current === mine) scannerRef.current = null;
    };
    // onScan/onClose are called, not observed — re-subscribing on every parent
    // render would tear down the live camera stream mid-scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isScanning, cameraId]);

  const stopScanner = () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    scannerRef.current = null;
    // Recorded on the same ref the start path waits on, so an explicit stop and
    // an unmount-driven one cannot race each other either.
    teardownRef.current = teardownRef.current
      .then(() => stopInstance(scanner))
      .catch(() => undefined);
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
                          placeholder="Paste QR payload or member ID"
                          className="flex-1 bg-dark border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-primary-start transition-colors"
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
                    {/* Camera picker — laptops often expose several (built-in, external, virtual) */}
                    {cameras.length > 1 && (
                      <select
                        value={cameraId}
                        onChange={(e) => setCameraId(e.target.value)}
                        className="w-full bg-dark border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm focus:border-primary-start transition-colors"
                      >
                        {cameras.map((c, i) => (
                          <option key={c.id} value={c.id}>
                            {c.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Scanner Container */}
                    <div className="relative bg-black rounded-2xl overflow-hidden">
                      <div id="qr-reader" className="w-full"></div>
                      
                      {/* Scanning overlay. Only the outer edge — html5-qrcode draws
                          its own shaded box at the real crop bounds, and a second
                          fixed-size square on top of it just misleads your aim. */}
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 border-4 border-primary-start/50 rounded-2xl animate-pulse"></div>
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
                            placeholder="Paste QR payload or member ID"
                            className="flex-1 bg-dark border border-dark-border rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-primary-start transition-colors"
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
