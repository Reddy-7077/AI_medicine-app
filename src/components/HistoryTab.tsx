export interface HistoryEntry {
  id: string;
  type: 'interaction' | 'voice';
  title: string;
  input: string;
  output: string;
  metrics: string | null;
  createdAt: string;
}

interface Props {
  entries: HistoryEntry[];
  onDelete: (id: string) => void;
  onClear: () => void;
}

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryTab({ entries, onDelete, onClear }: Props) {
  return (
    <div className="home-container">
      <div className="card">
        <div className="history-header-row">
          <div>
            <div className="card-label">Local History</div>
            <p className="history-subtitle">Saved only on this device</p>
          </div>
          <button className="btn btn-secondary btn-small" onClick={onClear} disabled={entries.length === 0}>
            Clear all
          </button>
        </div>

        {entries.length === 0 && (
          <p className="history-empty-text">
            No activity yet. Run an interaction check or voice report to create local history entries.
          </p>
        )}

        {entries.length > 0 && (
          <div className="history-list">
            {entries.map((entry) => (
              <div key={entry.id} className="history-item">
                <div className="history-meta-row">
                  <span className={`history-kind ${entry.type === 'voice' ? 'voice' : 'interaction'}`}>
                    {entry.type === 'voice' ? 'Voice Report' : 'Interaction Check'}
                  </span>
                  <span className="history-time">{formatTimestamp(entry.createdAt)}</span>
                </div>
                <div className="history-title">{entry.title}</div>
                <div className="history-output">{entry.output}</div>
                {entry.metrics && <div className="metrics-text">{entry.metrics}</div>}
                <button className="btn btn-secondary btn-small" onClick={() => onDelete(entry.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="disclaimer-box">
        <strong>Data control:</strong> History is stored in browser local storage only. Clearing history removes it from this device.
      </div>
    </div>
  );
}
