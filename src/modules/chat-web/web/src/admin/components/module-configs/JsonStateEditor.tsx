import { useState, useEffect } from 'react';
import styles from './JsonStateEditor.module.scss';

interface JsonStateEditorProps {
  moduleName: string;
  state: Record<string, unknown> | null;
  readOnly?: boolean;
  onSave?: (newState: Record<string, unknown>) => Promise<void>;
}

const JsonStateEditor: React.FC<JsonStateEditorProps> = ({
  moduleName,
  state,
  readOnly = true,
  onSave,
}) => {
  const [jsonText, setJsonText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const text = state ? JSON.stringify(state, null, 2) : '';
    setJsonText(text);
    setOriginalText(text);
    setParseError(null);
  }, [state]);

  const handleChange = (value: string) => {
    setJsonText(value);
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const handleSave = async () => {
    if (!onSave || parseError) return;

    setSaving(true);
    try {
      const parsed = JSON.parse(jsonText);
      await onSave(parsed);
      setOriginalText(jsonText);
    } catch (err) {
      console.error('Failed to save state:', err);
      alert(err instanceof Error ? err.message : 'Failed to save state');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setJsonText(originalText);
    setParseError(null);
  };

  const hasChanges = jsonText !== originalText;

  if (!state) {
    return (
      <div className={styles.empty}>
        No state available for {moduleName} (module may not be initialized)
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>{moduleName} State</span>
        {readOnly && <span className={styles.readOnlyBadge}>Read Only</span>}
      </div>

      <textarea
        className={`${styles.textarea} ${parseError ? styles.invalidJson : ''}`}
        value={jsonText}
        onChange={(e) => handleChange(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
      />

      {parseError && <div className={styles.error}>Parse error: {parseError}</div>}

      {!readOnly && onSave && (
        <div className={styles.actions}>
          {hasChanges && (
            <button className={styles.resetButton} onClick={handleReset}>
              Reset
            </button>
          )}
          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={!hasChanges || !!parseError || saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
};

export default JsonStateEditor;
