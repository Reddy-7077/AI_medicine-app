import type { ModelProgress, MultiModelState } from '../hooks/useMultiModelLoader';

interface Props {
  state: MultiModelState;
  models: ModelProgress[];
  error: string | null;
  onStart: () => void;
}

function getModelDisplayName(modelId: string): string {
  const names: Record<string, string> = {
    'silero-vad-v5': 'Voice Activity Detection',
    'sherpa-onnx-whisper-tiny.en': 'Speech Recognition',
    'lfm2-350m-q4_k_m': 'Language Model',
    'vits-piper-en_US-lessac-medium': 'Speech Synthesis',
  };
  return names[modelId] || modelId;
}

export function ModelDownloadScreen({ state, models, error, onStart }: Props) {
  const allCached = models.every((m) => m.status === 'downloaded' || m.status === 'loaded');
  const isWorking = state === 'downloading' || state === 'loading';
  const allReady = state === 'ready';

  return (
    <div className="download-screen">
      <div className="download-card">
        <h1 className="download-title">Setting up MedSafe</h1>
        <p className="download-subtitle">
          Downloading AI models for private, on-device medication guidance. This happens once — models are cached for future use.
        </p>

        <div className="model-rows">
          {models.map((model) => (
            <div key={model.modelId} className="model-row">
              <div className="model-name">{getModelDisplayName(model.modelId)}</div>
              <div className="model-status-pill-container">
                {model.status === 'pending' && (
                  <span className="model-status-pill">Waiting</span>
                )}
                {model.status === 'downloading' && (
                  <span className="model-status-pill status-downloading">
                    {(model.progress * 100).toFixed(0)}%
                  </span>
                )}
                {model.status === 'downloaded' && (
                  <span className="model-status-pill status-cached">Cached ✓</span>
                )}
                {model.status === 'loading' && (
                  <span className="model-status-pill status-loading">Loading...</span>
                )}
                {model.status === 'loaded' && (
                  <span className="model-status-pill status-ready">Ready ✓</span>
                )}
              </div>
              {model.status === 'downloading' && (
                <div className="progress-bar-thin">
                  <div className="progress-fill-thin" style={{ width: `${model.progress * 100}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="error-box">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="download-button-container">
          {state === 'idle' && !allCached && (
            <button className="btn btn-primary" onClick={onStart}>
              Download & Start
            </button>
          )}

          {state === 'idle' && allCached && (
            <>
              <div className="info-pill">
                ✓ All models cached. Loading into memory...
              </div>
              <button className="btn btn-primary" onClick={onStart}>
                Load Models
              </button>
            </>
          )}

          {isWorking && (
            <button className="btn btn-primary" disabled>
              <span className="loading-spinner" />
              {state === 'downloading' ? 'Downloading...' : 'Loading...'}
            </button>
          )}

          {allReady && (
            <div className="info-pill" style={{ color: 'var(--green)' }}>
              ✓ All models ready! Starting MedSafe...
            </div>
          )}

          {error && (
            <button className="btn btn-secondary" onClick={onStart}>
              Retry
            </button>
          )}
        </div>
      </div>

      <div className="disclaimer-box" style={{ maxWidth: '400px', marginTop: '20px' }}>
        <strong>Privacy:</strong> All AI models run on your device. No data is sent to external servers.
      </div>
    </div>
  );
}
