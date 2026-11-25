'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

export function ProfileFlip({
  imageUrl,
  role,
  introduction,
}: {
  imageUrl: string;
  role: string;
  introduction: string;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      className={`profileFlip${flipped ? ' is-flipped' : ''}`}
      aria-pressed={flipped}
      onClick={() => setFlipped((current) => !current)}
      aria-label={flipped ? 'Show profile image' : 'Flip profile card to show role and introduction'}
    >
      <span className="profileFlipInner">
        <span className="profileFlipFace profileFlipFront">
          {imageUrl ? <Image src={imageUrl} alt="Radyframes creative lead profile" fill unoptimized sizes="(max-width: 700px) 90vw, 42vw" /> : <span className="profileInitials">RF</span>}
          <small>RADYFRAMES / PROFILE</small>
        </span>
        <span className="profileFlipFace profileFlipBack">
          <span className="eyebrow">{role || 'ROLE / NEEDS OWNER INPUT'}</span>
          <span>{introduction || 'Studio profile needs owner input.'}</span>
          <small>Tap to flip back</small>
        </span>
      </span>
    </button>
  );
}

export function AnimatedStat({ value, label }: { value: number; label: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    let startTime = 0;
    const duration = 800;
    const animate = (time: number) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value < 1) {
        setDisplayValue(value);
        return;
      }
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      setDisplayValue(Math.round(value * progress));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <div className="aboutStat"><strong>{displayValue}</strong><span>{label}</span></div>;
}
