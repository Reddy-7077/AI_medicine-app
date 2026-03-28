import { useState, useCallback, useEffect, useRef } from 'react';
import { TextGeneration } from '@runanywhere/web-llamacpp';
import { PillLabelScanner } from './PillLabelScanner';

const SYSTEM_PROMPT = `You are a medication safety assistant. The user will give you a list of medications. List any known dangerous drug interactions clearly and concisely. Always end with: "Consult your pharmacist or doctor before making any changes."`;
const BASE_MAX_TOKENS = 80;

interface Props {
  onVoiceClick: () => void;
  accel: string | null;
  onResult: (payload: {
    medications: string[];
    response: string;
    metrics: string | null;
  }) => void;
}

export function MedicationInteractionChecker({ onVoiceClick, accel, onResult }: Props) {
  const [medications, setMedications] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, { response: string; metrics: string | null }>>(new Map());
  const warmedUpRef = useRef(false);

  useEffect(() => {
    if (warmedUpRef.current) return;
    warmedUpRef.current = true;

    // Warm up kernels once so first real interaction check starts faster.
    void (async () => {
      try {
        const { result } = await TextGeneration.generateStream('Warm up.', {
          systemPrompt: 'Reply with OK.',
          maxTokens: 8,
          temperature: 0,
        });
        await result;
      } catch {
        // Warm-up failure should never block the checker.
      }
    })();
  }, []);

  const addMedication = useCallback(() => {
    if (inputValue.trim()) {
      setMedications((prev) => [...prev, inputValue.trim()]);
      setInputValue('');
      setShowInput(false);
    }
  }, [inputValue]);

  const removeMedication = useCallback((index: number) => {
    setMedications((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleScannedMedication = useCallback((medication: string) => {
    setMedications((prev) => [...prev, medication]);
    setShowScanner(false);
  }, []);

  const handleCheck = useCallback(async () => {
    if (medications.length === 0) {
      setError('Please add at least one medication');
      return;
    }

    setResponse('');
    setError(null);
    setMetrics(null);
    setIsGenerating(true);

    const cacheKey = medications
      .map((med) => med.trim().toLowerCase())
      .sort()
      .join('|');

    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResponse(cached.response);
      setMetrics(cached.metrics ?? 'cached result');
      onResult({
        medications,
        response: cached.response,
        metrics: cached.metrics ?? 'cached result',
      });
      setIsGenerating(false);
      return;
    }

    try {
      const maxTokens = medications.length > 3 ? BASE_MAX_TOKENS + 30 : BASE_MAX_TOKENS;

      setResponse('Running fast local safety pass...');

      const { stream, result } = await TextGeneration.generateStream(
        `Medications: ${medications.join(', ')}`,
        {
          systemPrompt: `${SYSTEM_PROMPT} Keep the answer under 4 short bullet points and one final caution line.`,
          maxTokens,
          temperature: 0.15,
        }
      );

      let fullText = '';
      let tokenCounter = 0;
      for await (const token of stream) {
        fullText += token;
        tokenCounter += 1;

        // Reduce render churn: update UI every few streamed tokens.
        if (tokenCounter % 8 === 0) {
          setResponse(fullText);
        }
      }

      setResponse(fullText);

      const finalResult = await result;
      const finalMetrics =
        `${finalResult.tokensUsed} tokens · ${finalResult.latencyMs}ms · ${finalResult.tokensPerSecond.toFixed(1)} tok/s`
      ;

      if (cacheRef.current.size > 24) {
        const firstKey = cacheRef.current.keys().next().value;
        if (firstKey) {
          cacheRef.current.delete(firstKey);
        }
      }
      cacheRef.current.set(cacheKey, { response: fullText, metrics: finalMetrics });

      setMetrics(finalMetrics);
      onResult({
        medications,
        response: fullText,
        metrics: finalMetrics,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      
      // Handle specific error for image input attempts
      if (errMsg.includes('image') || errMsg.includes('does not support image input')) {
        setError('Image input is not supported. MedSafe uses text-based AI models for medication safety. Please enter medication names as text.');
      } else {
        setError(errMsg);
      }
      
      console.error('Interaction check error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [medications, onResult]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="home-container">
      {/* Header */}
      <div className="home-header">
        <div className="greeting-text">{getGreeting()}</div>
        <h1 className="app-title">MedSafe</h1>
        {accel && (
          <div className="status-pill">
            <span className="status-dot" />
            {accel === 'webgpu' ? 'WEBGPU · ON-DEVICE' : 'CPU · ON-DEVICE'}
          </div>
        )}
      </div>

      {/* Medication Input Card */}
      <div className="ondevice-pitch-card">
        <div className="card-label">Why On-Device AI</div>
        <div className="pitch-grid">
          <div className="pitch-item">
            <div className="pitch-icon">PRIVACY</div>
            <p>Medication names and symptoms stay on this device.</p>
          </div>
          <div className="pitch-item">
            <div className="pitch-icon">OFFLINE</div>
            <p>Model inference works even with unstable internet.</p>
          </div>
          <div className="pitch-item">
            <div className="pitch-icon">INSTANT</div>
            <p>No cloud request lag during urgent checks.</p>
          </div>
          <div className="pitch-item">
            <div className="pitch-icon">CONTROL</div>
            <p>You can review and clear local AI history anytime.</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-label">Interaction Checker</div>

        <div className="medication-list">
          {medications.map((med, index) => (
            <div key={index} className="medication-chip">
              {med}
              <button onClick={() => removeMedication(index)}>×</button>
            </div>
          ))}
          
          {!showInput && (
            <button className="add-medication-chip" onClick={() => setShowInput(true)}>
              + Add medication
            </button>
          )}
        </div>

        {showInput && (
          <div className="medication-input-row">
            <input
              type="text"
              className="text-input"
              placeholder="e.g., Warfarin"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addMedication();
                if (e.key === 'Escape') {
                  setShowInput(false);
                  setInputValue('');
                }
              }}
              autoFocus
            />
            <button className="btn btn-secondary btn-small" onClick={addMedication}>
              Add
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowScanner(true)}
            style={{ flex: 1 }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '6px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Scan Label
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCheck}
            disabled={isGenerating || medications.length === 0}
            style={{ flex: 1 }}
          >
            {isGenerating ? (
              <>
                <span className="loading-spinner" />
                Checking...
              </>
            ) : (
              'Check interactions'
            )}
          </button>
        </div>
      </div>

      {/* Pill Label Scanner Modal */}
      <PillLabelScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onMedicationScanned={handleScannedMedication}
      />

      {/* Error */}
      {error && (
        <div className="error-box">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results Card */}
      {response && (
        <div className="results-card">
          <div className="card-label">Results</div>
          <div className="streaming-text">
            {response}
            {isGenerating && <span className="cursor-blink" />}
          </div>
          {metrics && <div className="metrics-text">{metrics}</div>}
        </div>
      )}

      {/* Voice Shortcut */}
      <div className="voice-shortcut-card" onClick={onVoiceClick}>
        <div className="voice-shortcut-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </div>
        <div className="voice-shortcut-text">
          <h4>Voice Symptom Reporter</h4>
          <p>Tap to report a symptom</p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="disclaimer-box">
        <strong>Medical Disclaimer:</strong> This tool provides educational information only. Always
        consult your healthcare provider or pharmacist before making any medication changes.
      </div>
    </div>
  );
}
