import { useState } from 'react';
import { X, Star } from 'lucide-react';

interface RatingPromptProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  trainerName: string;
}

export default function RatingPrompt({ isOpen, onClose, className = '', trainerName }: RatingPromptProps) {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (rating === 0) return;
    const memberId = localStorage.getItem('memberEmail') || 'eya.lorenzana@email.com';
    const key = `ratings_${memberId}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push({
      id: `rating-${Date.now()}`,
      trainerName,
      rating,
      comment,
      date: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify(existing));
    setSubmitted(true);
    setTimeout(() => {
      onClose();
      setSubmitted(false);
      setRating(0);
      setComment('');
    }, 1500);
  };

  return (
    <div className={`fixed inset-0 z-[200] flex items-center justify-center p-6 ${className}`}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      <div
        className="relative rounded-2xl p-6 w-full max-w-[300px] text-center"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}
        >
          <X size={14} />
        </button>

        {submitted ? (
          <div className="py-4">
            <p className="text-3xl mb-2">🎉</p>
            <p className="text-white font-bold">Thank you!</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Your rating has been saved.
            </p>
          </div>
        ) : (
          <>
            <p className="text-2xl mb-2">⭐</p>
            <h3 className="text-white font-bold text-lg">Rate your session</h3>
            <p className="text-xs mt-1 mb-4" style={{ color: 'var(--color-text-muted)' }}>
              How was your session with {trainerName}?
            </p>

            {/* Stars */}
            <div className="flex items-center justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  className="transition-transform active:scale-90"
                >
                  <Star
                    size={28}
                    fill={(hoveredStar || rating) >= star ? 'var(--color-secondary)' : 'transparent'}
                    style={{
                      color: (hoveredStar || rating) >= star ? 'var(--color-secondary)' : 'var(--color-border)',
                    }}
                  />
                </button>
              ))}
            </div>

            {/* Comment */}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Leave a comment (optional)"
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm text-white resize-none focus:outline-none mb-4"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            />

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={rating === 0}
              className="w-full h-10 rounded-full font-semibold text-sm text-black disabled:opacity-40"
              style={{ background: 'var(--color-secondary)' }}
            >
              Submit Rating
            </button>
          </>
        )}
      </div>
    </div>
  );
}
