import { useState, useEffect } from 'react';

/**
 * Hook for tracking session duration in seconds
 */
export function useSessionTimer() {
  const [sessionDuration, setSessionDuration] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSessionDuration(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Format as HH:MM:SS
  const formatDuration = () => {
    const hours = Math.floor(sessionDuration / 3600);
    const minutes = Math.floor((sessionDuration % 3600) / 60);
    const seconds = sessionDuration % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return {
    sessionDuration,
    formattedDuration: formatDuration()
  };
}
