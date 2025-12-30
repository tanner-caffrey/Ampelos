import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent, DragEvent } from 'react';
import type { MessageContent } from '../../types';
import { compressImage, createImagePreview, isImageFile, detectImageUrl } from '../../utils/images';
import Button from '../../sacred/components/Button';
import TextArea from '../../sacred/components/TextArea';
import './ChatInput.scss';

interface ChatInputProps {
  onSend: (content: MessageContent[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

interface ImageAttachment {
  type: 'file' | 'url';
  file?: File;
  url?: string;
  preview: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Type a message...' }: ChatInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [detectingUrl, setDetectingUrl] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleImageSelect = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(isImageFile).slice(0, 10 - imageAttachments.length);

    if (imageFiles.length === 0) return;

    const newAttachments: ImageAttachment[] = await Promise.all(
      imageFiles.map(async (file) => ({
        type: 'file' as const,
        file,
        preview: await createImagePreview(file),
      }))
    );

    setImageAttachments((prev) => [...prev, ...newAttachments]);
  }, [imageAttachments.length]);

  const addImageUrl = useCallback((url: string) => {
    if (imageAttachments.length >= 10) return;

    const newAttachment: ImageAttachment = {
      type: 'url',
      url,
      preview: url, // Use URL directly as preview
    };

    setImageAttachments((prev) => [...prev, newAttachment]);
  }, [imageAttachments.length]);

  const removeImage = useCallback((index: number) => {
    setImageAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if ((!inputValue.trim() && imageAttachments.length === 0) || disabled || sending) return;

    setSending(true);

    try {
      const content: MessageContent[] = [];

      // Add text content
      if (inputValue.trim()) {
        content.push({ type: 'text', text: inputValue.trim() });
      }

      // Add images (both files and URLs)
      for (const attachment of imageAttachments) {
        if (attachment.type === 'file' && attachment.file) {
          const compressed = await compressImage(attachment.file);
          content.push({
            type: 'image',
            imageData: compressed.data,
            imageMimeType: compressed.mimeType,
          });
        } else if (attachment.type === 'url' && attachment.url) {
          content.push({
            type: 'image',
            imageUrl: attachment.url,
          });
        }
      }

      await onSend(content);

      // Clear inputs
      setInputValue('');
      setImageAttachments([]);
    } finally {
      setSending(false);
    }
  }, [inputValue, imageAttachments, disabled, sending, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleImageSelect(e.dataTransfer.files);
    }
  }, [handleImageSelect]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    let textContent = '';

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      } else if (item.type === 'text/plain') {
        textContent = e.clipboardData.getData('text/plain');
      }
    }

    // If we got image files directly, use those
    if (imageFiles.length > 0) {
      handleImageSelect(imageFiles);
      return;
    }

    // Check if the pasted text looks like an image URL (quick sync check)
    if (textContent && imageAttachments.length < 10) {
      const trimmed = textContent.trim();

      // Quick sync check for obvious image URLs (by extension)
      const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'];
      let looksLikeImageUrl = false;

      try {
        const url = new URL(trimmed);
        if (['http:', 'https:'].includes(url.protocol)) {
          const pathname = url.pathname.toLowerCase();
          looksLikeImageUrl = IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext));
        }
      } catch {
        // Not a valid URL
      }

      if (looksLikeImageUrl) {
        // Prevent the text from being pasted - we'll add it as an image
        e.preventDefault();
        addImageUrl(trimmed);
      } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        // It's a URL but doesn't have an obvious image extension
        // Try to detect async (won't prevent paste, but will offer to convert)
        setDetectingUrl(true);
        detectImageUrl(trimmed).then((imageUrl) => {
          setDetectingUrl(false);
          if (imageUrl) {
            // Found an image - add it and clear the pasted URL from input
            addImageUrl(imageUrl);
            setInputValue((prev) => prev.replace(trimmed, '').trim());
          }
        });
      }
    }
  }, [handleImageSelect, addImageUrl, imageAttachments.length]);

  return (
    <div
      className={`chat-input ${isDraggingOver ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {imageAttachments.length > 0 && (
        <div className="image-previews">
          {imageAttachments.map((attachment, idx) => (
            <div key={idx} className={`image-preview ${attachment.type === 'url' ? 'url-image' : ''}`}>
              <img src={attachment.preview} alt={`Preview ${idx + 1}`} />
              {attachment.type === 'url' && <span className="url-badge">URL</span>}
              <button
                className="remove-image"
                onClick={() => removeImage(idx)}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="input-row">
        <button
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || imageAttachments.length >= 10}
          type="button"
          title="Attach images"
        >
          📎
        </button>

        <textarea
          ref={textareaRef}
          className="message-textarea"
          value={inputValue}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={detectingUrl ? 'Detecting image...' : placeholder}
          disabled={disabled}
          rows={1}
        />

        <Button
          onClick={handleSubmit}
          disabled={disabled || sending || (!inputValue.trim() && imageAttachments.length === 0)}
        >
          {sending ? '...' : 'Send'}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => e.target.files && handleImageSelect(e.target.files)}
        style={{ display: 'none' }}
      />

      {isDraggingOver && (
        <div className="drop-overlay">
          Drop images here
        </div>
      )}
    </div>
  );
}

export default ChatInput;
