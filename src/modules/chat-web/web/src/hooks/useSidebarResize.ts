import { useState, useEffect, useRef } from 'react';

interface SidebarResizeOptions {
  initialWidth?: number;
  minWidth?: number;
  maxWidthPercent?: number;
  characterWidth?: number;
}

interface SidebarResizeReturn {
  width: number;
  setWidth: (width: number) => void;
  isDragging: boolean;
  startDrag: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing sidebar resize with drag functionality
 */
export function useSidebarResize(options: SidebarResizeOptions = {}): SidebarResizeReturn {
  const {
    initialWidth = 20,
    minWidth = 15,
    maxWidthPercent = 0.5,
    characterWidth = 9.6  // Approximate: 1ch ≈ 9.6px for monospace
  } = options;

  const [width, setWidth] = useState<number>(initialWidth);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const startDrag = (e: React.MouseEvent) => {
    dragStartRef.current = {
      startX: e.clientX,
      startWidth: width
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const viewportWidth = window.innerWidth;
      const maxWidthCh = (viewportWidth * maxWidthPercent) / characterWidth;

      // Calculate delta from start position (for left sidebar, positive when dragging right)
      const deltaX = e.clientX - dragStartRef.current.startX;
      const deltaCh = deltaX / characterWidth;

      // Calculate new width
      const newWidthCh = dragStartRef.current.startWidth + deltaCh;

      // Apply constraints
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidthCh, newWidthCh));
      setWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minWidth, maxWidthPercent, characterWidth]);

  return {
    width,
    setWidth,
    isDragging,
    startDrag
  };
}

interface DualSidebarResizeOptions {
  leftInitialWidth?: number;
  rightInitialWidth?: number;
  minWidth?: number;
  maxWidthPercent?: number;
  characterWidth?: number;
}

interface DualSidebarResizeReturn {
  leftWidth: number;
  setLeftWidth: (width: number) => void;
  rightWidth: number;
  setRightWidth: (width: number) => void;
  isDragging: boolean;
  startLeftDrag: (e: React.MouseEvent) => void;
  startRightDrag: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing dual sidebar resize (left and right sidebars)
 */
export function useDualSidebarResize(options: DualSidebarResizeOptions = {}): DualSidebarResizeReturn {
  const {
    leftInitialWidth = 20,
    rightInitialWidth = 30,
    minWidth = 15,
    maxWidthPercent = 0.5,
    characterWidth = 9.6
  } = options;

  const [leftWidth, setLeftWidth] = useState<number>(leftInitialWidth);
  const [rightWidth, setRightWidth] = useState<number>(rightInitialWidth);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number; side: 'left' | 'right' } | null>(null);

  const startLeftDrag = (e: React.MouseEvent) => {
    dragStartRef.current = {
      startX: e.clientX,
      startWidth: leftWidth,
      side: 'left'
    };
    setIsDragging(true);
  };

  const startRightDrag = (e: React.MouseEvent) => {
    dragStartRef.current = {
      startX: e.clientX,
      startWidth: rightWidth,
      side: 'right'
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const viewportWidth = window.innerWidth;
      const maxWidthCh = (viewportWidth * maxWidthPercent) / characterWidth;

      // Calculate delta from start position
      const deltaX = dragStartRef.current.side === 'right'
        ? dragStartRef.current.startX - e.clientX  // Right sidebar: negative when dragging right (making larger)
        : e.clientX - dragStartRef.current.startX; // Left sidebar: positive when dragging right (making larger)
      const deltaCh = deltaX / characterWidth;

      // Calculate new width
      const newWidthCh = dragStartRef.current.startWidth + deltaCh;

      // Apply constraints
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidthCh, newWidthCh));

      if (dragStartRef.current.side === 'right') {
        setRightWidth(constrainedWidth);
      } else {
        setLeftWidth(constrainedWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minWidth, maxWidthPercent, characterWidth]);

  return {
    leftWidth,
    setLeftWidth,
    rightWidth,
    setRightWidth,
    isDragging,
    startLeftDrag,
    startRightDrag
  };
}
