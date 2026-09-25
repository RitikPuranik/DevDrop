import React, { useState, useEffect } from 'react';

const LETTERS = "devdrop".split("");
const TAGLINE = "WE BUILD WE BREAK WE FIX WE SHIP";

const CinematicLoader = ({ onComplete }) => {
  const [phase, setPhase] = useState(1);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => (prev < 100 ? prev + 1 : 100));
    }, 40);

    const timers = [
      setTimeout(() => setPhase(2), 2400),
      setTimeout(() => setPhase(3), 5200),
      setTimeout(() => onComplete(), 7000),
    ];

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [onComplete]);

  return (
    <div className="cinematic-loader fixed inset-0 z-[10000] flex items-center justify-center bg-[#030303] overflow-hidden">
      <style>{`
        .cinematic-loader .loader-content {
          animation: loader-content-in 900ms cubic-bezier(.16,1,.3,1) both;
          will-change: opacity, transform;
        }

        .cinematic-loader .loader-letter {
          opacity: 0;
          transform: translate3d(calc((var(--i) - 3) * 100px), var(--start-y), 0) scale(1.2);
          filter: blur(20px);
          animation: loader-letter-in 900ms cubic-bezier(.16,1,.3,1) forwards;
          animation-delay: calc(var(--i) * 100ms);
          will-change: opacity, transform, filter;
        }

        .cinematic-loader .loader-progress {
          opacity: 0;
          transform: translate3d(0, 30px, 0);
        }

        .cinematic-loader.phase-two .loader-progress {
          animation: loader-progress-in 1.5s cubic-bezier(.16,1,.3,1) both;
        }

        .cinematic-loader .loader-bar-fill {
          transform: scaleX(calc(var(--progress) / 100));
          transform-origin: left center;
          will-change: transform;
        }

        .cinematic-loader.phase-three .loader-content {
          animation: loader-content-out 1.8s cubic-bezier(.76,0,.24,1) both;
        }

        .cinematic-loader .loader-exit {
          clip-path: circle(0% at 50% 50%);
          opacity: 1;
        }

        .cinematic-loader.phase-three .loader-exit {
          animation: loader-exit 2.2s cubic-bezier(.76,0,.24,1) both;
        }

        .cinematic-loader .loader-exit-flash {
          opacity: 0;
        }

        .cinematic-loader.phase-three .loader-exit-flash {
          animation: loader-flash 2.2s ease-out both;
        }

        @keyframes loader-content-in {
          from { opacity: 0; transform: translate3d(0, 8px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @keyframes loader-letter-in {
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes loader-progress-in {
          from { opacity: 0; transform: translate3d(0, 30px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @keyframes loader-content-out {
          from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
          to { opacity: 0; transform: translate3d(0, 0, 0) scale(1.05); filter: blur(40px); }
        }

        @keyframes loader-exit {
          from { clip-path: circle(0% at 50% 50%); opacity: 1; }
          to { clip-path: circle(150% at 50% 50%); opacity: 0; }
        }

        @keyframes loader-flash {
          0%, 35%, 100% { opacity: 0; }
          50% { opacity: .1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cinematic-loader .loader-letter,
          .cinematic-loader .loader-progress,
          .cinematic-loader .loader-content,
          .cinematic-loader .loader-exit,
          .cinematic-loader .loader-exit-flash {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
          }
        }
      `}</style>

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04] z-50 mix-blend-screen"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
      />

      <div className={`loader-content relative flex flex-col items-center w-full ${phase === 2 ? 'phase-two' : ''} ${phase === 3 ? 'phase-three' : ''}`}>
        <div className="flex items-center mb-4">
          {LETTERS.map((char, i) => (
            <span
              key={i}
              className="loader-letter font-serif italic text-[14vw] md:text-[9vw] text-[#e8e2d6] leading-none px-1 select-none"
              style={{
                '--i': i,
                '--start-y': i % 2 === 0 ? '-40px' : '40px',
                textShadow: '0 0 40px rgba(232,226,214,0.15)',
              }}
            >
              {char}
            </span>
          ))}
        </div>

        <div className={`loader-progress flex flex-col items-center w-full mt-16 ${phase >= 2 ? 'phase-two' : ''}`}>
          <div className="font-mono text-[10px] md:text-[15px] tracking-[0.4em] text-[#e8e2d6]/30 uppercase mb-24">
            {TAGLINE}
          </div>

          <div className="relative w-56 md:w-80">
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[20px] text-[#e8e2d6]/80 tabular-nums">
              {progress}%
            </span>

            <div className="relative w-full h-[8px] bg-[#e8e2d6]/10 rounded-full overflow-hidden">
              <div
                className="loader-bar-fill h-full bg-[#e8e2d6] rounded-full shadow-[0_0_20px_rgba(232,226,214,0.6)]"
                style={{ '--progress': progress }}
              />
            </div>
          </div>
        </div>
      </div>

      {phase === 3 && (
        <div className="loader-exit absolute inset-0 bg-[#030303] z-[10001] pointer-events-none">
          <div className="loader-exit-flash absolute inset-0 bg-[#e8e2d6]" />
        </div>
      )}
    </div>
  );
};

export default CinematicLoader;
