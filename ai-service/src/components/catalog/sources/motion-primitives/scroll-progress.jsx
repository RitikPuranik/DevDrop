/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : motion-primitives/scroll-progress
 * Source    : github.com/ibelick/motion-primitives @ 120f64f6ca60 : components/core/scroll-progress.tsx
 * License   : MIT, Copyright (c) 2024 ibelick
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { motion, useScroll, useSpring } from "motion/react";
import { cn } from "../../lib/utils.js";
const DEFAULT_SPRING_OPTIONS = {
  stiffness: 200,
  damping: 50,
  restDelta: 1e-3
};
function ScrollProgress({
  className,
  springOptions,
  containerRef
}) {
  const { scrollYProgress } = useScroll({
    container: containerRef,
    layoutEffect: Boolean(containerRef?.current)
  });
  const scaleX = useSpring(scrollYProgress, {
    ...DEFAULT_SPRING_OPTIONS,
    ...springOptions ?? {}
  });
  return <motion.div
    className={cn("inset-x-0 top-0 h-1 origin-left", className)}
    style={{
      scaleX
    }}
  />;
}
export {
  ScrollProgress
};
