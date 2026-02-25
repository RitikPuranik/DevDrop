import { useEffect, useRef } from "react";

import v1 from "../assets/videos/v1.mp4";
import v2 from "../assets/videos/v2.mp4";
import v3 from "../assets/videos/v3.mp4";

export default function FlipOnScroll() {
  const cardsRef = useRef([]);
  const videos = [v1, v2, v3];

  useEffect(() => {
    const handleScroll = () => {
      cardsRef.current.forEach((card) => {
        if (!card) return;

        const rect = card.getBoundingClientRect();
        const h = window.innerHeight;

        const progress = Math.min(Math.max(1 - rect.top / h, 0), 1);

        card.style.transform = `
          perspective(1400px)
          rotateY(${progress * 90}deg)
          scale(${0.85 + progress * 0.15})
        `;
      });
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="page">
      {videos.map((src, i) => (
        <section className="section" key={i}>
          <div
            className="flip-card"
            ref={(el) => (cardsRef.current[i] = el)}
          >
            <video src={src} autoPlay muted loop playsInline />
          </div>
        </section>
      ))}
    </div>
  );
}
