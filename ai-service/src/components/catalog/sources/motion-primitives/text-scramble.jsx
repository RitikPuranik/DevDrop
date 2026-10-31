/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : motion-primitives/text-scramble
 * Source    : github.com/ibelick/motion-primitives @ 120f64f6ca60 : components/core/text-scramble.tsx
 * License   : MIT, Copyright (c) 2024 ibelick
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
const defaultChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function TextScramble({
  children,
  duration = 0.8,
  speed = 0.04,
  characterSet = defaultChars,
  className,
  as: Component = "p",
  trigger = true,
  onScrambleComplete,
  ...props
}) {
  const MotionComponent = motion.create(
    Component
  );
  const [scrambledText, setScrambledText] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const text = children;
  const displayText = scrambledText ?? children;
  const scramble = async () => {
    if (isAnimating) return;
    setIsAnimating(true);
    const steps = duration / speed;
    let step = 0;
    const interval = setInterval(() => {
      let scrambled = "";
      const progress = step / steps;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === " ") {
          scrambled += " ";
          continue;
        }
        if (progress * text.length > i) {
          scrambled += text[i];
        } else {
          scrambled += characterSet[Math.floor(Math.random() * characterSet.length)];
        }
      }
      setScrambledText(scrambled);
      step++;
      if (step > steps) {
        clearInterval(interval);
        setScrambledText(null);
        setIsAnimating(false);
        onScrambleComplete?.();
      }
    }, speed * 1e3);
  };
  useEffect(() => {
    if (!trigger) return;
    scramble();
  }, [trigger]);
  return <MotionComponent className={className} {...props}>
      {displayText}
    </MotionComponent>;
}
export {
  TextScramble
};
