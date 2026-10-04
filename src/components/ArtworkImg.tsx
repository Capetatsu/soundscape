// Artwork with graceful degradation: creator-node / third-party hosts come and go.
// A dead image host must never break layout or spam errors — show the fallback instead.
import React, { useState } from 'react';

interface ArtworkImgProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackIcon?: string;
  eager?: boolean;
}

export const ArtworkImg: React.FC<ArtworkImgProps> = ({
  src,
  alt,
  className,
  fallbackIcon = 'music_note',
  eager
}) => {
  const [dead, setDead] = useState(false);
  if (!src || dead) {
    return (
      <div className={`${className ?? ''} flex items-center justify-center bg-[#131313] text-[#c6c6c7]`}>
        <span className="material-symbols-outlined text-2xl">{fallbackIcon}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setDead(true)}
    />
  );
};
