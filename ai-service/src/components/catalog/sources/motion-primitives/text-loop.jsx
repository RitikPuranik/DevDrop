/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : motion-primitives/text-loop
 * Source    : github.com/ibelick/motion-primitives @ 120f64f6ca60 : components/core/text-loop.tsx
 * License   : MIT, Copyright (c) 2024 ibelick
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { cn } from "../../lib/utils.js";
import {
  motion,
  AnimatePresence
} from "motion/react";
import { useState, useEffect, Children } from "react";
function TextLoop({
  children,
  className,
  interval = 2,
  transition = { duration: 0.3 },
  variants,
  onIndexChange,
  trigger = true,
  mode = "popLayout"
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const items = Children.toArray(children);
  useEffect(() => {
    if (!trigger) return;
    const intervalMs = interval * 1e3;
    const timer = setInterval(() => {
      setCurrentIndex((current) => {
        const next = (current + 1) % items.length;
        onIndexChange?.(next);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [items.length, interval, onIndexChange, trigger]);
  const motionVariants = {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 }
  };
  return <div className={cn("relative inline-block whitespace-nowrap", className)}>
      <AnimatePresence mode={mode} initial={false}>
        <motion.div
    key={currentIndex}
    initial='initial'
    animate='animate'
    exit='exit'
    transition={transition}
    variants={variants || motionVariants}
  >
          {items[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>;
}
export {
  TextLoop
};
