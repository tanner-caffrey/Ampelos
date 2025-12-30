import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import './ScheduleModal.css';

interface Schedule {
  id: string;
  type: 'time' | 'loop';
  interval: number;
  message: string;
  role: 'user' | 'system';
  enabled: boolean;
  created_at: string;
  last_fired_at?: string;
  fire_count: number;
  loops_since_last_fire: number;
}

interface ScheduleModalProps {
  agentId: string;
  agentName: string;
  isOpen: boolean;
  onClose: () => void;
}

function ScheduleModal({ agentId, agentName, isOpen, onClose }: ScheduleModalProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<'time' | 'loop'>('time');
  const [interval, setInterval] = useState(5);
  const [unit, setUnit] = useState<'seconds' | 'minutes' | 'hours'>('minutes');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<'user' | 'system'>('user');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSchedules();
    }
  }, [isOpen, agentId]);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/schedules`);
      if (!response.ok) {
        throw new Error(`Failed to load schedules: ${response.statusText}`);
      }
      const data = await response.json();
      setSchedules(data.schedules || []);
    } catch (err) {
      console.error('Failed to load schedules:', err);
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      setCreating(true);
      setError(null);

      const response = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          interval,
          unit: type === 'time' ? unit : undefined,
          message: message.trim(),
          role
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create schedule');
      }

      // Reset form and reload
      setMessage('');
      setInterval(5);
      await loadSchedules();
    } catch (err) {
      console.error('Failed to create schedule:', err);
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    try {
      setError(null);
      const response = await apiFetch(
        `/api/agents/${encodeURIComponent(agentId)}/schedules/${encodeURIComponent(scheduleId)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete schedule');
      }

      await loadSchedules();
    } catch (err) {
      console.error('Failed to delete schedule:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    }
  };

  const formatInterval = (schedule: Schedule): string => {
    if (schedule.type === 'loop') {
      return `Every ${schedule.interval} loop${schedule.interval > 1 ? 's' : ''}`;
    }

    const seconds = schedule.interval;
    if (seconds < 60) return `Every ${seconds}s`;
    if (seconds < 3600) return `Every ${Math.round(seconds / 60)}m`;
    return `Every ${Math.round(seconds / 3600)}h`;
  };

  const formatLastFired = (schedule: Schedule): string => {
    if (!schedule.last_fired_at) return 'Never';

    const diff = Date.now() - new Date(schedule.last_fired_at).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (!isOpen) return null;

  return (
    <div className="schedule-modal-overlay" onClick={onClose}>
      <div className="schedule-modal" onClick={e => e.stopPropagation()}>
        <div className="schedule-modal-header">
          <h2>Scheduled Messages</h2>
          <span className="schedule-agent-name">{agentName}</span>
          <button className="schedule-modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && (
          <div className="schedule-error">
            <span>{error}</span>
            <button onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        <div className="schedule-modal-body">
          {/* Create New Schedule Form */}
          <form className="schedule-form" onSubmit={handleCreate}>
            <h3>Create New Schedule</h3>

            <div className="schedule-form-row">
              <div className="schedule-form-field">
                <label>Type</label>
                <select value={type} onChange={e => setType(e.target.value as 'time' | 'loop')}>
                  <option value="time">Time-based</option>
                  <option value="loop">Loop-based</option>
                </select>
              </div>

              <div className="schedule-form-field">
                <label>Interval</label>
                <div className="schedule-interval-input">
                  <input
                    type="number"
                    min={1}
                    value={interval}
                    onChange={e => setInterval(parseInt(e.target.value) || 1)}
                  />
                  {type === 'time' ? (
                    <select value={unit} onChange={e => setUnit(e.target.value as 'seconds' | 'minutes' | 'hours')}>
                      <option value="seconds">seconds</option>
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                    </select>
                  ) : (
                    <span className="schedule-unit-label">loops</span>
                  )}
                </div>
              </div>

              <div className="schedule-form-field">
                <label>Role</label>
                <select value={role} onChange={e => setRole(e.target.value as 'user' | 'system')}>
                  <option value="user">User</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>

            <div className="schedule-form-field">
              <label>Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Enter the message to send..."
                rows={3}
              />
            </div>

            <button
              type="submit"
              className="schedule-create-btn"
              disabled={creating || !message.trim()}
            >
              {creating ? 'Creating...' : 'Create Schedule'}
            </button>
          </form>

          {/* Existing Schedules */}
          <div className="schedule-list-section">
            <h3>Active Schedules ({schedules.length})</h3>

            {loading ? (
              <div className="schedule-loading">Loading...</div>
            ) : schedules.length === 0 ? (
              <div className="schedule-empty">No active schedules</div>
            ) : (
              <div className="schedule-list">
                {schedules.map(schedule => (
                  <div key={schedule.id} className="schedule-item">
                    <div className="schedule-item-header">
                      <span className={`schedule-type schedule-type-${schedule.type}`}>
                        {schedule.type}
                      </span>
                      <span className="schedule-interval">{formatInterval(schedule)}</span>
                      <span className={`schedule-role schedule-role-${schedule.role}`}>
                        {schedule.role}
                      </span>
                      <button
                        className="schedule-delete-btn"
                        onClick={() => handleDelete(schedule.id)}
                        title="Delete schedule"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="schedule-message">{schedule.message}</div>
                    <div className="schedule-stats">
                      <span>Fired: {schedule.fire_count} times</span>
                      <span>Last: {formatLastFired(schedule)}</span>
                      {schedule.type === 'loop' && (
                        <span>Progress: {schedule.loops_since_last_fire}/{schedule.interval}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScheduleModal;
