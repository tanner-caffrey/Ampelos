import MatrixLoader from '../sacred/components/MatrixLoader';

interface MatrixBackgroundProps {
  enabled: boolean;
}

/**
 * Matrix-style animated background effect
 */
export function MatrixBackground({ enabled }: MatrixBackgroundProps) {
  if (!enabled) return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      opacity: 0.03,
      pointerEvents: 'none',
      zIndex: 0,
      overflow: 'hidden'
    }}>
      <MatrixLoader rows={50} mode="katakana" direction="top-to-bottom" />
    </div>
  );
}
