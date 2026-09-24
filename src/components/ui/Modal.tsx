import { useEffect, type ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div
        className={`pixel-panel pixel-corners max-h-[90dvh] w-full animate-pop overflow-y-auto p-5 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xs text-ball">{title}</h2>
          <button onClick={onClose} className="text-mute hover:text-cream" aria-label="Close">
            <PixelIcon name="close" size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
