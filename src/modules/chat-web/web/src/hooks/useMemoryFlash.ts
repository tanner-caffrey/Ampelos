import { useState, useEffect, useCallback } from 'react';
import type { MemoryBlock } from '../types';

interface MemoryFlashReturn {
  /** Set of block IDs that are currently flashing (recently updated) */
  flashingBlocks: Set<string>;
  /** Map of block ID to timestamp of last update */
  lastUpdatedBlocks: Map<string, number>;
  /** Map of block ID to the value before the update (for diff display) */
  diffBaseValues: Map<string, string>;
  /** Process new memory blocks and detect changes */
  processBlocks: (newBlocks: MemoryBlock[]) => void;
  /** Clear flash state for a specific block */
  clearFlash: (blockId: string) => void;
  /** Clear all flash states */
  clearAllFlashes: () => void;
}

interface UseMemoryFlashOptions {
  /** Time in ms before flash auto-dismisses (default: 60000ms / 1 minute) */
  flashDuration?: number;
  /** Interval in ms to check for expired flashes (default: 5000ms) */
  checkInterval?: number;
  /** Set of currently expanded block IDs (flashes won't auto-dismiss while expanded) */
  expandedBlocks?: Set<string>;
}

/**
 * Hook for tracking memory block updates and managing flash animations
 */
export function useMemoryFlash(options: UseMemoryFlashOptions = {}): MemoryFlashReturn {
  const {
    flashDuration = 60000,
    checkInterval = 5000,
    expandedBlocks = new Set()
  } = options;

  const [flashingBlocks, setFlashingBlocks] = useState<Set<string>>(new Set());
  const [lastUpdatedBlocks, setLastUpdatedBlocks] = useState<Map<string, number>>(new Map());
  const [diffBaseValues, setDiffBaseValues] = useState<Map<string, string>>(new Map());
  const [previousValues, setPreviousValues] = useState<Map<string, string>>(new Map());

  // Process new blocks and detect changes
  const processBlocks = useCallback((newBlocks: MemoryBlock[]) => {
    const now = Date.now();
    const newFlashing = new Set(flashingBlocks);
    const newLastUpdated = new Map(lastUpdatedBlocks);
    const newPrevious = new Map(previousValues);
    const newDiffBase = new Map(diffBaseValues);
    let changed = false;

    newBlocks.forEach(block => {
      const prevValue = previousValues.get(block.id);
      // If we have a previous value and it's different
      if (prevValue !== undefined && prevValue !== block.value) {
        newFlashing.add(block.id);
        newLastUpdated.set(block.id, now);
        newDiffBase.set(block.id, prevValue);
        changed = true;
      }
      // Always update the previous value for next comparison
      newPrevious.set(block.id, block.value);
    });

    if (changed) {
      setFlashingBlocks(newFlashing);
      setLastUpdatedBlocks(newLastUpdated);
      setDiffBaseValues(newDiffBase);
    }
    setPreviousValues(newPrevious);
  }, [flashingBlocks, lastUpdatedBlocks, previousValues, diffBaseValues]);

  // Clear flash for specific block
  const clearFlash = useCallback((blockId: string) => {
    setFlashingBlocks(prev => {
      const next = new Set(prev);
      next.delete(blockId);
      return next;
    });
    setLastUpdatedBlocks(prev => {
      const next = new Map(prev);
      next.delete(blockId);
      return next;
    });
    setDiffBaseValues(prev => {
      const next = new Map(prev);
      next.delete(blockId);
      return next;
    });
  }, []);

  // Clear all flashes
  const clearAllFlashes = useCallback(() => {
    setFlashingBlocks(new Set());
    setLastUpdatedBlocks(new Map());
    setDiffBaseValues(new Map());
  }, []);

  // Auto-dismiss flashes after duration (but not if expanded)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      const newFlashing = new Set(flashingBlocks);
      const newLastUpdated = new Map(lastUpdatedBlocks);
      const newDiffBase = new Map(diffBaseValues);

      lastUpdatedBlocks.forEach((timestamp, blockId) => {
        // Don't dismiss if block is expanded
        if (now - timestamp > flashDuration && !expandedBlocks.has(blockId)) {
          newFlashing.delete(blockId);
          newLastUpdated.delete(blockId);
          newDiffBase.delete(blockId);
          changed = true;
        }
      });

      if (changed) {
        setFlashingBlocks(newFlashing);
        setLastUpdatedBlocks(newLastUpdated);
        setDiffBaseValues(newDiffBase);
      }
    }, checkInterval);

    return () => clearInterval(interval);
  }, [flashingBlocks, lastUpdatedBlocks, diffBaseValues, flashDuration, checkInterval, expandedBlocks]);

  return {
    flashingBlocks,
    lastUpdatedBlocks,
    diffBaseValues,
    processBlocks,
    clearFlash,
    clearAllFlashes
  };
}
