import { useState } from 'react';
import './mockup-ribbon.css';

const WORDS = ['TRAIN', 'CONNECT', 'PROGRESS', 'REPEAT'];

export default function MockupRibbon() {
  const [paused, setPaused] = useState(false);
  return (
    <section className={`v2-ribbon${paused ? ' is-paused' : ''}`} id="fitness-ribbon" aria-label="Train. Connect. Progress. Repeat. Core Fitness.">
      <div className="v2-ribbon-track" aria-hidden="true">
        {[0, 1].map(copy => <div className="v2-ribbon-group" key={copy}>
          {WORDS.map(word => <span className="v2-ribbon-item" key={word}><b>{word}</b><img src="/logo-320.webp" alt="" width="54" height="54" /></span>)}
        </div>)}
      </div>
      <button type="button" className="v2-ribbon-pause" aria-label={paused ? 'Play scrolling ribbon' : 'Pause scrolling ribbon'} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? '▶' : 'Ⅱ'}</button>
    </section>
  );
}
