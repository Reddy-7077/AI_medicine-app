import { useState, useRef, useEffect, useCallback } from 'react';
import { VideoCapture } from '@runanywhere/web';
import { VLMWorkerBridge, StructuredOutput } from '@runanywhere/web-llamacpp';

interface MedicationData {
  name: string;
  dosage: string;
  unit: string;
  frequency: string;
}

function isMedicationData(value: unknown): value is MedicationData {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.dosage === 'string' &&
    typeof obj.unit === 'string' &&
    typeof obj.frequency === 'string'
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onMedicationScanned: (medication: string) => void;
}

const SCAN_PROMPT = `You are a medication label reader. Extract the medicine name, dosage amount, dosage unit, and frequency from this label. Reply ONLY with JSON in this exact format, no other text:
{"name": "", "dosage": "", "unit": "", "frequency": ""}`;

export function PillLabelScanner({ isOpen, onClose, onMedicationScanned }: Props) {
  const [cameraActive, setCameraActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoMountRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<VideoCapture | null>(null);

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen && !cameraActive) {
      startCamera();
    }
    
    return () => {
      if (captureRef.current) {
        captureRef.current.stop();
        captureRef.current = null;
        setCameraActive(false);
      }
    };
  }, [isOpen]);

  const startCamera = useCallback(async () => {
    if (captureRef.current?.isCapturing) return;

    setError(null);

    try {
      const cam = new VideoCapture({ facingMode: 'environment' });
      await cam.start();
      captureRef.current = cam;

      const mount = videoMountRef.current;
      if (mount) {
        const el = cam.videoElement;
        el.style.width = '100%';
        el.style.borderRadius = '12px';
        mount.appendChild(el);
      }

      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setError('Camera permission denied. Please enable camera access in your browser settings.');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setError('No camera found on this device.');
      } else if (msg.includes('NotReadable') || msg.includes('TrackStartError')) {
        setError('Camera is in use by another application.');
      } else {
        setError(`Camera error: ${msg}`);
      }
    }
  }, []);

  const captureAndScan = useCallback(async () => {
    const cam = captureRef.current;
    if (!cam?.isCapturing) return;

    setProcessing(true);
    setError(null);

    try {
      // Ensure VLM model is loaded
      const bridge = VLMWorkerBridge.shared;
      if (!bridge.isInitialized) {
        await bridge.init();
      }

      if (!bridge.isModelLoaded) {
        setError('VLM model is not loaded. Please load the vision model first.');
        setProcessing(false);
        return;
      }

      // Capture frame
      const frame = cam.captureFrame(256);
      if (!frame) {
        setError('Failed to capture frame from camera.');
        setProcessing(false);
        return;
      }

      // Process with VLM
      const result = await bridge.process(
        frame.rgbPixels,
        frame.width,
        frame.height,
        SCAN_PROMPT,
        { maxTokens: 100, temperature: 0.3 }
      );

      // Extract JSON from response
      const jsonData = StructuredOutput.extractJson(result.text);
      
      if (!jsonData) {
        setError('Could not read label. Please ensure the label is clearly visible and well-lit, then try again.');
        setProcessing(false);
        return;
      }

      // Parse and validate medication data
      let parsedData: unknown = jsonData;
      if (typeof jsonData === 'string') {
        parsedData = JSON.parse(jsonData);
      }

      if (!isMedicationData(parsedData)) {
        setError('The scanned label format was invalid. Please try again with clearer text.');
        setProcessing(false);
        return;
      }

      const medData = parsedData;
      
      if (!medData.name || medData.name.trim() === '') {
        setError('No medication name detected. Please try again with a clearer view of the label.');
        setProcessing(false);
        return;
      }

      // Build medication string
      let medicationString = medData.name.trim();
      if (medData.dosage && medData.unit) {
        medicationString += ` ${medData.dosage}${medData.unit}`;
      }

      // Add to medications list
      onMedicationScanned(medicationString);

      // Close scanner
      handleClose();

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      
      // Handle WASM memory crashes
      if (msg.includes('memory access out of bounds') || msg.includes('RuntimeError')) {
        setError('Memory error occurred. Please try again.');
      } else {
        setError(`Scan failed: ${msg}`);
      }
      
      console.error('Label scan error:', err);
    } finally {
      setProcessing(false);
    }
  }, [onMedicationScanned]);

  const handleClose = useCallback(() => {
    if (captureRef.current) {
      captureRef.current.stop();
      captureRef.current = null;
    }
    setCameraActive(false);
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="scanner-overlay" onClick={handleClose}>
      <div className="scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scanner-header">
          <h3>Scan Pill Label</h3>
          <button className="scanner-close-btn" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="scanner-camera">
          {!cameraActive && !error && (
            <div className="scanner-loading">
              <div className="spinner-large" />
              <p>Starting camera...</p>
            </div>
          )}
          {error && (
            <div className="scanner-error">
              <p>{error}</p>
              <button className="btn btn-secondary btn-small" onClick={startCamera}>
                Retry
              </button>
            </div>
          )}
          <div ref={videoMountRef} />
        </div>

        {cameraActive && (
          <>
            <div className="scanner-hint">
              Position the medication label clearly in the frame
            </div>

            <div className="scanner-actions">
              <button className="btn btn-secondary" onClick={handleClose} disabled={processing}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={captureAndScan}
                disabled={processing}
              >
                {processing ? (
                  <>
                    <span className="loading-spinner" />
                    Reading label...
                  </>
                ) : (
                  'Capture & Scan'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
