import { useState, useCallback } from 'react';

interface ImageUploadReturn {
  /** Selected image files */
  selectedImages: File[];
  /** Data URL previews for selected images */
  imagePreviews: string[];
  /** Whether user is dragging files over the drop zone */
  isDraggingOver: boolean;
  /** Handle file input change */
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Remove image at index */
  removeImage: (index: number) => void;
  /** Handle drag over event */
  handleDragOver: (e: React.DragEvent) => void;
  /** Handle drag leave event */
  handleDragLeave: (e: React.DragEvent) => void;
  /** Handle drop event */
  handleDrop: (e: React.DragEvent) => void;
  /** Clear all selected images */
  clearImages: () => void;
  /** Set images and previews (for restoring on error) */
  setImages: (files: File[], previews: string[]) => void;
}

interface UseImageUploadOptions {
  /** Maximum file size warning threshold in bytes (default: 50MB) */
  maxFileSizeWarning?: number;
  /** Whether uploads are enabled */
  enabled?: boolean;
}

/**
 * Hook for managing image upload state and drag-drop functionality
 */
export function useImageUpload(options: UseImageUploadOptions = {}): ImageUploadReturn {
  const { maxFileSizeWarning = 50 * 1024 * 1024, enabled = true } = options;

  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const createPreviews = useCallback((files: File[]) => {
    const newPreviews: string[] = [];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          newPreviews.push(e.target.result as string);
          if (newPreviews.length === files.length) {
            setImagePreviews(newPreviews);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Warn about large files
    const oversizedFiles = files.filter(f => f.size > maxFileSizeWarning);
    if (oversizedFiles.length > 0) {
      console.warn(
        `[ImageUpload] Large files detected (will be compressed):`,
        oversizedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)
      );
    }

    const newFiles = [...selectedImages, ...files];
    setSelectedImages(newFiles);
    createPreviews(newFiles);
  }, [selectedImages, maxFileSizeWarning, createPreviews]);

  const removeImage = useCallback((index: number) => {
    const newFiles = selectedImages.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    setSelectedImages(newFiles);
    setImagePreviews(newPreviews);
  }, [selectedImages, imagePreviews]);

  const handleDropFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Filter to only image files
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    // Warn about large files
    const oversizedFiles = imageFiles.filter(f => f.size > maxFileSizeWarning);
    if (oversizedFiles.length > 0) {
      console.warn(
        `[ImageUpload] Large files detected (will be compressed):`,
        oversizedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)
      );
    }

    const newFiles = [...selectedImages, ...imageFiles];
    setSelectedImages(newFiles);
    createPreviews(newFiles);
  }, [selectedImages, maxFileSizeWarning, createPreviews]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (enabled) {
      setIsDraggingOver(true);
    }
  }, [enabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (!enabled) return;

    const files = e.dataTransfer.files;
    handleDropFiles(files);
  }, [enabled, handleDropFiles]);

  const clearImages = useCallback(() => {
    setSelectedImages([]);
    setImagePreviews([]);
  }, []);

  const setImages = useCallback((files: File[], previews: string[]) => {
    setSelectedImages(files);
    setImagePreviews(previews);
  }, []);

  return {
    selectedImages,
    imagePreviews,
    isDraggingOver,
    handleImageSelect,
    removeImage,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    clearImages,
    setImages
  };
}
