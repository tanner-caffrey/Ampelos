/**
 * Utility functions for image processing
 */

/**
 * Check if a file is an image based on MIME type
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Create a preview data URL from a File
 */
export function createImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Common image file extensions
 */
const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.avif'
];

/**
 * Check if a URL points to an image based on extension or content-type headers
 * Returns the validated URL if it's an image, null otherwise
 */
export async function detectImageUrl(text: string): Promise<string | null> {
  // Try to parse as URL
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(url.protocol)) {
    return null;
  }

  const pathname = url.pathname.toLowerCase();

  // Quick check: does it have an image extension?
  if (IMAGE_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
    return text.trim();
  }

  // For URLs without clear extensions (like imgur, etc.), try a HEAD request
  try {
    const response = await fetch(text.trim(), {
      method: 'HEAD',
      mode: 'cors',
    });

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.startsWith('image/')) {
      return text.trim();
    }
  } catch {
    // CORS or network error - can't verify, but if user explicitly pasted it,
    // we could still try. For now, return null for safety.
  }

  return null;
}

/**
 * Compress and resize image to reduce size
 * Returns base64 data and mime type
 */
export function compressImage(
  file: File,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.85
): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG (more efficient than PNG for photos)
        // Try different quality levels if still too large
        const tryCompress = (q: number): void => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }

              // Check size - max ~4MB base64 (roughly 3MB binary)
              const maxSize = 3 * 1024 * 1024; // 3MB
              if (blob.size > maxSize && q > 0.5) {
                // Try lower quality
                tryCompress(q - 0.1);
              } else {
                // Convert to base64
                const reader2 = new FileReader();
                reader2.onload = () => {
                  const result = reader2.result as string;
                  const base64Data = result.split(',')[1];
                  resolve({
                    data: base64Data,
                    mimeType: 'image/jpeg'
                  });
                };
                reader2.onerror = reject;
                reader2.readAsDataURL(blob);
              }
            },
            'image/jpeg',
            q
          );
        };

        tryCompress(quality);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
