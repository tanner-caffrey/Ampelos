import { useState, useEffect, useRef, RefObject } from 'react';

interface AutoScrollOptions {
  /** Pixel threshold for considering "near bottom" */
  threshold?: number;
  /** Delay before scrolling (ms) */
  scrollDelay?: number;
}

interface AutoScrollReturn {
  /** Ref for the scroll container */
  containerRef: RefObject<HTMLDivElement>;
  /** Ref for the scroll target element at bottom */
  endRef: RefObject<HTMLDivElement>;
  /** Whether user has scrolled up from bottom */
  isScrolledUp: boolean;
  /** Whether initial scroll to bottom has occurred */
  hasScrolledToBottom: boolean;
  /** Reset scroll state (call when changing views) */
  resetScroll: () => void;
  /** Manually scroll to bottom */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

/**
 * Hook for managing auto-scroll to bottom behavior
 * Scrolls to bottom on initial load and when new content arrives (if already at bottom)
 */
export function useAutoScroll<T>(
  /** Dependency that triggers scroll check (e.g., messages array) */
  dependency: T,
  /** Optional dependency to reset scroll (e.g., selected agent) */
  resetDependency?: unknown,
  options: AutoScrollOptions = {}
): AutoScrollReturn {
  const { threshold = 150, scrollDelay = 50 } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  // Scroll to bottom utility
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior });
    }
  };

  // Reset scroll state
  const resetScroll = () => {
    setHasScrolledToBottom(false);
    setIsScrolledUp(false);
  };

  // Initial scroll to bottom
  useEffect(() => {
    // Skip if dependency is empty array
    const isNonEmpty = Array.isArray(dependency) ? dependency.length > 0 : Boolean(dependency);

    if (isNonEmpty && !hasScrolledToBottom) {
      const timeoutId = setTimeout(() => {
        if (endRef.current) {
          endRef.current.scrollIntoView({ behavior: 'auto' });
          setHasScrolledToBottom(true);
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [dependency, hasScrolledToBottom]);

  // Reset scroll flag when reset dependency changes
  useEffect(() => {
    if (resetDependency !== undefined) {
      resetScroll();
    }
  }, [resetDependency]);

  // Auto-scroll when dependency changes (if already at bottom)
  useEffect(() => {
    const scrollIfAtBottom = () => {
      if (containerRef.current && endRef.current) {
        const container = containerRef.current;
        const isNearBottom =
          container.scrollHeight - container.scrollTop <= container.clientHeight + threshold;

        if (isNearBottom) {
          endRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };

    const timeoutId = setTimeout(scrollIfAtBottom, scrollDelay);
    return () => clearTimeout(timeoutId);
  }, [dependency, threshold, scrollDelay]);

  // Track scroll position for "scroll to bottom" button
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsScrolledUp(!isNearBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [dependency]);

  return {
    containerRef,
    endRef,
    isScrolledUp,
    hasScrolledToBottom,
    resetScroll,
    scrollToBottom
  };
}
