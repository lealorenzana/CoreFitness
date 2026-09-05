import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { X, Camera, QrCode, AlertCircle } from 'lucide-react';
import Button from './Button';
import jsQR from 'jsqr';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (qrCode: string) => void;
}

/**
 * The decode loop, and why it is no longer html5-qrcode.
 *
 * The previous scanner ran html5-qrcode with
 * `experimentalFeatures.useBarCodeDetectorIfSupported`, and its own comment
 * explained the choice: the native `BarcodeDetector` is "far more tolerant of
 * glare and the moire you get pointing a webcam at another screen than the JS
 * fallback".
 *
 * That is true, and **`BarcodeDetector` does not exist in Chrome on Windows** —
 * it ships on Android, macOS and ChromeOS. The gym runs the dashboard on a
 * Windows PC, so the tolerant path was never taken there once. Every frame fell
 * through to html5-qrcode's bundled ZXing decoder, at **10fps on a cropped 80%
 * box**, which is the least forgiving setup available for the exact job this
 * desk does: reading a QR off a lit phone screen with a webcam.
 *
 * Nothing surfaced an error, because a decode miss is not an error. The camera
 * ran, the picture looked right, and the code was simply never found.
 *
 * The pipeline now, at animation-frame rate over the whole frame:
 *
 *     getUserMedia -> video -> canvas.drawImage -> getImageData -> jsQR
 *
 * `BarcodeDetector` is still used **where it exists** — on an Android tablet at
 * the desk it is faster and better than anything in JS. It is a fast path now
 * rather than the only good path, and the floor underneath it is jsQR instead
 * of ZXing.
 */

/** Stop every track on a stream. Safe to call twice. */
function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* already ended */
    }
  });
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>('');
  const [hasCamera, setHasCamera] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraId, setCameraId] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Set the instant a code is accepted, so an in-flight frame cannot fire twice. */
  const doneRef = useRef(false);

  /**
   * Step 1: find the cameras.
   *
   * `enumerateDevices` withholds labels until permission has been granted, so a
   * throwaway stream is opened and closed first. Without it the picker reads
   * "Camera 1 / Camera 2" and the desk cannot tell the real webcam from the
   * virtual one Teams installs.
   */
  useEffect(() => {
    if (!isOpen || !isScanning) return;
    let cancelled = false;

    (async () => {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ video: true });
        stopStream(probe);
        if (cancelled) return;

        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === 'videoinput');
        if (cancelled) return;

        if (cams.length === 0) {
          setHasCamera(false);
          setError('No camera found. Please use manual entry.');
          return;
        }
        setHasCamera(true);
        setError('');
        setCameras(cams.map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
        const rear = cams.find((d) => /back|rear|environment/i.test(d.label));
        setCameraId((current) => current || rear?.deviceId || cams[0].deviceId);
      } catch (err) {
        if (cancelled) return;
        console.error('Camera enumeration failed:', err);
        setHasCamera(false);
        setError('Unable to access camera. Please allow camera permission, or use manual entry.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isScanning]);

  // Step 2: stream the chosen camera and decode every frame.
  useEffect(() => {
    if (!isOpen || !isScanning || !cameraId) return;
    let cancelled = false;
    doneRef.current = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: cameraId },
            // 1280x720 is not a nicety. At the 640x480 a webcam defaults to,
            // this QR's modules are a few pixels across and no decoder reads it.
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) {
          stopStream(stream);
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        setHasCamera(true);
        setError('');

        // Native detector where the platform has one. Absent on Windows, which
        // is the whole reason this component was rewritten.
        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (o: { formats: string[] }) => {
              detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector;
        const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;

        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const accept = (text: string) => {
          if (doneRef.current) return;
          doneRef.current = true;
          onScan(text);
          onClose();
        };

        const tick = async () => {
          if (cancelled || doneRef.current) return;
          const v = videoRef.current;

          if (v && v.readyState === v.HAVE_ENOUGH_DATA && ctx) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

            if (detector) {
              try {
                const found = await detector.detect(canvas);
                if (found.length > 0 && found[0].rawValue) {
                  accept(found[0].rawValue);
                  return;
                }
              } catch {
                /* fall through to jsQR */
              }
            }

            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            // The whole frame, never a crop. A tight box clips the QR's quiet
            // zone, and a quiet zone under four modules wide stops it decoding
            // at all — which is how the old 80% qrbox could refuse a code that
            // was plainly centred in the picture.
            //
            // `attemptBoth` costs a second pass and buys a code shown light-on-
            // dark, which is exactly what the member app renders.
            const code = jsQR(frame.data, frame.width, frame.height, {
              inversionAttempts: 'attemptBoth',
            });
            if (code?.data) {
              accept(code.data);
              return;
            }
          }

          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
        };

        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Scanner error:', err);
        setHasCamera(false);
        setError('Unable to start that camera. Try another, or use manual entry.');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    // onScan/onClose are called, not observed — re-subscribing on every parent
    // render would tear down the live camera stream mid-scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isScanning, cameraId]);

  const stopScanner = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
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
                          onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
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
                      <video
                        ref={videoRef}
                        className="w-full block"
                        style={{ aspectRatio: '4 / 3', objectFit: 'cover' }}
                        muted
                        playsInline
                      />

                      {/* An aiming hint only. The whole frame is decoded, so
                          unlike the old fixed square this cannot misrepresent
                          where the scanner is actually looking. */}
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 border-4 border-primary-start/50 rounded-2xl animate-pulse"></div>
                      </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="rounded-xl p-4 flex items-start gap-3"
                        style={{ background: 'var(--color-secondary-light)', border: '1px solid var(--color-secondary)' }}>
                        <AlertCircle size={20} style={{ color: 'var(--color-secondary)' }} className="flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-secondary)' }}>Camera Error</p>
                          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
                        </div>
                      </div>
                    )}

                    {/* Instructions */}
                    {!error && (
                      <div className="rounded-xl p-4"
                        style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)' }}>
                        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--color-primary)' }}>Scanning tips</p>
                        <ul className="text-xs space-y-1 ml-4 list-disc" style={{ color: 'var(--color-text-secondary)' }}>
                          <li>Turn the phone brightness up — a dim screen is the usual cause</li>
                          <li>Hold it 6–12 inches away and steady</li>
                          <li>Tilt slightly to kill the reflection off the glass</li>
                          <li>It detects automatically; there is no button to press</li>
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
                            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
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
