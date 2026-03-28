import { useState, useEffect } from 'react';
import { initSDK, getAccelerationMode, ModelManager } from './runanywhere';
import { ModelDownloadScreen } from './components/ModelDownloadScreen';
import { MedicationInteractionChecker } from './components/MedicationInteractionChecker';
import { VoiceSymptomReporter } from './components/VoiceSymptomReporter';
import { HistoryTab, type HistoryEntry } from './components/HistoryTab';
import { ProfileTab } from './components/ProfileTab';
import { useMultiModelLoader } from './hooks/useMultiModelLoader';

type Tab = 'home' | 'history' | 'voice' | 'profile';

// Core model for the Home experience (fast startup path)
const CORE_MODELS = ['lfm2-350m-q4_k_m'];

// Voice-only models, loaded lazily when Voice tab is opened
const VOICE_MODELS = [
  'silero-vad-v5',
  'sherpa-onnx-whisper-tiny.en',
  'vits-piper-en_US-lessac-medium',
];

const HISTORY_STORAGE_KEY = 'medsafe-local-history-v1';

export function App() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

  const {
    state: coreState,
    models: coreModels,
    error: coreError,
    loadAll: loadCore,
  } = useMultiModelLoader(CORE_MODELS);

  const {
    state: voiceModelState,
    models: voiceModels,
    error: voiceModelError,
    loadAll: loadVoiceModels,
  } = useMultiModelLoader(VOICE_MODELS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as HistoryEntry[];
      if (!Array.isArray(parsed)) return;
      setHistoryEntries(parsed);
    } catch (err) {
      console.warn('Failed to load local history', err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
    } catch (err) {
      console.warn('Failed to save local history', err);
    }
  }, [historyEntries]);

  useEffect(() => {
    initSDK()
      .then(() => setSdkReady(true))
      .catch((err) => setSdkError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Auto-load cached models after SDK is ready
  useEffect(() => {
    if (!sdkReady) return;

    // Check if all models are already downloaded/cached
    const allModels = ModelManager.getModels();
    const allCached = CORE_MODELS.every((id) => {
      const model = allModels.find((m) => m.id === id);
      return model?.status === 'downloaded' || model?.status === 'loaded';
    });

    // If all models are cached, auto-load them into memory
    if (allCached && coreState === 'idle') {
      loadCore();
    }
  }, [sdkReady, coreState, loadCore]);

  useEffect(() => {
    if (activeTab !== 'voice') return;
    if (voiceModelState !== 'idle') return;

    // Start voice model loading as soon as user opens Voice tab.
    loadVoiceModels();
  }, [activeTab, voiceModelState, loadVoiceModels]);

  // SDK initialization error
  if (sdkError) {
    return (
      <div className="app-loading">
        <h2>SDK Error</h2>
        <p className="error-text">{sdkError}</p>
      </div>
    );
  }

  // SDK initializing
  if (!sdkReady) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <h2>Loading RunAnywhere SDK...</h2>
        <p>Initializing on-device AI engine</p>
      </div>
    );
  }

  // Models not ready - show download screen
  if (coreState !== 'ready') {
    return (
      <ModelDownloadScreen
        state={coreState}
        models={coreModels}
        error={coreError}
        onStart={loadCore}
      />
    );
  }

  const accel = getAccelerationMode();

  const appendEntry = (entry: Omit<HistoryEntry, 'id' | 'createdAt'>) => {
    setHistoryEntries((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date().toISOString(),
        ...entry,
      },
      ...prev,
    ]);
  };

  const handleDeleteEntry = (id: string) => {
    setHistoryEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleClearHistory = () => {
    setHistoryEntries([]);
  };

  const handleExportHistory = () => {
    const blob = new Blob([JSON.stringify(historyEntries, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medsafe-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <div className="app-content">
        {activeTab === 'home' && (
          <MedicationInteractionChecker
            onVoiceClick={() => setActiveTab('voice')}
            accel={accel}
            onResult={(payload) => {
              appendEntry({
                type: 'interaction',
                title: payload.medications.join(', '),
                input: `Medications: ${payload.medications.join(', ')}`,
                output: payload.response,
                metrics: payload.metrics,
              });
            }}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab
            entries={historyEntries}
            onDelete={handleDeleteEntry}
            onClear={handleClearHistory}
          />
        )}
        {activeTab === 'voice' && (
          voiceModelState === 'ready' ? (
            <VoiceSymptomReporter
              onTurnComplete={(payload) => {
                appendEntry({
                  type: 'voice',
                  title: payload.transcript,
                  input: payload.transcript,
                  output: payload.response,
                  metrics: payload.metrics,
                });
              }}
            />
          ) : (
            <ModelDownloadScreen
              state={voiceModelState}
              models={voiceModels}
              error={voiceModelError}
              onStart={loadVoiceModels}
            />
          )
        )}
        {activeTab === 'profile' && (
          <ProfileTab
            entryCount={historyEntries.length}
            onClearData={handleClearHistory}
            onExportData={handleExportHistory}
          />
        )}
      </div>

      <div className="privacy-footer">
        All AI processing happens on your device. Your health data never leaves your browser.
      </div>

      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="nav-label">Home</span>
        </button>

        <button className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="nav-label">History</span>
        </button>

        <button className={`nav-item ${activeTab === 'voice' ? 'active' : ''}`} onClick={() => setActiveTab('voice')}>
          <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <span className="nav-label">Voice</span>
        </button>

        <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <svg className="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="nav-label">Profile</span>
        </button>
      </nav>
    </div>
  );
}
