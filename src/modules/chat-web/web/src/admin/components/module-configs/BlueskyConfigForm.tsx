import { useState } from 'react';
import styles from './ModuleConfigForm.module.scss';

interface NamedFeed {
  name: string;
  uri: string;
  description?: string;
}

interface BlueskyConfigFormProps {
  onSubmit: (config: BlueskyConfig) => void;
  onCancel: () => void;
  loading?: boolean;
  initialConfig?: BlueskyConfig;
}

export interface BlueskyConfig {
  handle: string;
  service?: string;
  feeds?: NamedFeed[];
}

const BlueskyConfigForm: React.FC<BlueskyConfigFormProps> = ({
  onSubmit,
  onCancel,
  loading = false,
  initialConfig,
}) => {
  const [handle, setHandle] = useState(initialConfig?.handle || '');
  const [service, setService] = useState(initialConfig?.service || 'https://bsky.social');
  const [useCustomService, setUseCustomService] = useState(!!initialConfig?.service && initialConfig.service !== 'https://bsky.social');
  const [feeds, setFeeds] = useState<NamedFeed[]>(initialConfig?.feeds || []);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUri, setNewFeedUri] = useState('');
  const [newFeedDescription, setNewFeedDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;

    const config: BlueskyConfig = {
      handle: handle.trim(),
    };

    if (useCustomService && service.trim() !== 'https://bsky.social') {
      config.service = service.trim();
    }

    if (feeds.length > 0) {
      config.feeds = feeds;
    }

    onSubmit(config);
  };

  const addFeed = () => {
    if (!newFeedName.trim() || !newFeedUri.trim()) return;

    // Check for duplicate name
    if (feeds.some(f => f.name.toLowerCase() === newFeedName.trim().toLowerCase())) {
      alert('A feed with this name already exists');
      return;
    }

    const feed: NamedFeed = {
      name: newFeedName.trim(),
      uri: newFeedUri.trim(),
    };
    if (newFeedDescription.trim()) {
      feed.description = newFeedDescription.trim();
    }

    setFeeds([...feeds, feed]);
    setNewFeedName('');
    setNewFeedUri('');
    setNewFeedDescription('');
  };

  const removeFeed = (index: number) => {
    setFeeds(feeds.filter((_, i) => i !== index));
  };

  const isValid = handle.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <h3 className={styles.formTitle}>Configure Bluesky Module</h3>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="bsky-handle">
          Bluesky Handle <span className={styles.required}>*</span>
        </label>
        <input
          id="bsky-handle"
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="user.bsky.social"
          className={styles.input}
          disabled={loading}
          autoFocus
        />
        <p className={styles.hint}>
          The Bluesky handle for this agent (e.g., myagent.bsky.social)
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={useCustomService}
            onChange={(e) => setUseCustomService(e.target.checked)}
            disabled={loading}
          />
          Use custom PDS service
        </label>
      </div>

      {useCustomService && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="bsky-service">
            PDS Service URL
          </label>
          <input
            id="bsky-service"
            type="url"
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="https://bsky.social"
            className={styles.input}
            disabled={loading}
          />
          <p className={styles.hint}>
            The AT Protocol PDS service URL (default: https://bsky.social)
          </p>
        </div>
      )}

      <div className={styles.infoBox}>
        <strong>Note:</strong> The password for this agent must be set in the{' '}
        <code>.env</code> file as <code>BLUESKY_{'{AGENT_NAME}'}_PASSWORD</code>
        <br />
        (e.g., <code>BLUESKY_GALLI_PASSWORD=your-app-password</code>)
      </div>

      {/* Named Feeds Section */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Named Feeds</h4>
        <p className={styles.hint}>
          Configure custom feeds the agent can read from. These are referenced by name in the agent's tools.
        </p>

        {/* Existing feeds list */}
        {feeds.length > 0 && (
          <div className={styles.feedsList}>
            {feeds.map((feed, index) => (
              <div key={index} className={styles.feedItem}>
                <div className={styles.feedInfo}>
                  <strong>{feed.name}</strong>
                  {feed.description && <span className={styles.feedDescription}> - {feed.description}</span>}
                  <div className={styles.feedUri}>{feed.uri}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFeed(index)}
                  className={styles.removeButton}
                  disabled={loading}
                  title="Remove feed"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new feed form */}
        <div className={styles.addFeedForm}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="feed-name">
              Feed Name
            </label>
            <input
              id="feed-name"
              type="text"
              value={newFeedName}
              onChange={(e) => setNewFeedName(e.target.value)}
              placeholder="e.g., What's Hot"
              className={styles.input}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="feed-uri">
              Feed URL or AT URI
            </label>
            <input
              id="feed-uri"
              type="text"
              value={newFeedUri}
              onChange={(e) => setNewFeedUri(e.target.value)}
              placeholder="https://bsky.app/profile/.../feed/... or at://..."
              className={styles.input}
              disabled={loading}
            />
            <p className={styles.hint}>
              Copy the URL from Bluesky when viewing a feed, or use an AT URI directly
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="feed-description">
              Description (optional)
            </label>
            <input
              id="feed-description"
              type="text"
              value={newFeedDescription}
              onChange={(e) => setNewFeedDescription(e.target.value)}
              placeholder="Brief description of this feed"
              className={styles.input}
              disabled={loading}
            />
          </div>

          <button
            type="button"
            onClick={addFeed}
            className={styles.addButton}
            disabled={loading || !newFeedName.trim() || !newFeedUri.trim()}
          >
            Add Feed
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          onClick={onCancel}
          className={styles.cancelButton}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={!isValid || loading}
        >
          {loading ? 'Saving...' : initialConfig ? 'Save Changes' : 'Add Module'}
        </button>
      </div>
    </form>
  );
};

export default BlueskyConfigForm;
