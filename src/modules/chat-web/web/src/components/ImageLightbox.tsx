interface ImageLightboxProps {
  imageSrc: string;
  onClose: () => void;
}

/**
 * Full-screen image lightbox overlay
 */
export function ImageLightbox({ imageSrc, onClose }: ImageLightboxProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        cursor: 'pointer'
      }}
    >
      <img
        src={imageSrc}
        alt="Full size"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain'
        }}
      />
    </div>
  );
}
