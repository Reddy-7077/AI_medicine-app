interface Props {
  entryCount: number;
  onClearData: () => void;
  onExportData: () => void;
}

export function ProfileTab({ entryCount, onClearData, onExportData }: Props) {
  return (
    <div className="home-container">
      <div className="card">
        <div className="card-label">On-Device AI Profile</div>

        <div className="profile-stat-grid">
          <div className="profile-stat-item">
            <span className="profile-stat-value">100%</span>
            <span className="profile-stat-label">Private Inference</span>
          </div>
          <div className="profile-stat-item">
            <span className="profile-stat-value">0</span>
            <span className="profile-stat-label">Cloud Requests</span>
          </div>
          <div className="profile-stat-item">
            <span className="profile-stat-value">{entryCount}</span>
            <span className="profile-stat-label">Local Records</span>
          </div>
        </div>

        <div className="profile-action-row">
          <button className="btn btn-secondary" onClick={onExportData} disabled={entryCount === 0}>
            Export local data
          </button>
          <button className="btn btn-secondary" onClick={onClearData} disabled={entryCount === 0}>
            Clear local data
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-label">Privacy Architecture</div>
        <ul className="privacy-list">
          <li>Models run entirely in-browser with RunAnywhere runtime.</li>
          <li>Medication inputs are processed locally on your device.</li>
          <li>No account required and no remote logging pipeline.</li>
          <li>You own the data and can export or delete it any time.</li>
        </ul>
      </div>
    </div>
  );
}
