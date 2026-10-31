/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : magicui/word-rotate
 * Source    : github.com/magicuidesign/magicui @ efe76fc5755e : apps/www/registry/magicui/word-rotate.tsx
 * License   : MIT, Copyright (c) Magic UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../lib/utils.js";
function WordRotate({
  words,
  duration = 2500,
  motionProps = {
    initial: { opacity: 0, y: -50 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 50 },
    transition: { duration: 0.25, ease: "easeOut" }
  },
  className
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % words.length);
    }, duration);
    return () => clearInterval(interval);
  }, [words, duration]);
  return <div className="overflow-hidden py-2">
      <AnimatePresence mode="wait">
        <motion.h1
    key={words[index]}
    className={cn(className)}
    {...motionProps}
  >
          {words[index]}
        </motion.h1>
      </AnimatePresence>
    </div>;
}
export {
  WordRotate
};
