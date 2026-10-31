/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : motion-primitives/border-trail
 * Source    : github.com/ibelick/motion-primitives @ 120f64f6ca60 : components/core/border-trail.tsx
 * License   : MIT, Copyright (c) 2024 ibelick
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { cn } from "../../lib/utils.js";
import { motion } from "motion/react";
function BorderTrail({
  className,
  size = 60,
  transition,
  onAnimationComplete,
  style
}) {
  const defaultTransition = {
    repeat: Infinity,
    duration: 5,
    ease: "linear"
  };
  return <div className='pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]'>
      <motion.div
    className={cn("absolute aspect-square bg-zinc-500", className)}
    style={{
      width: size,
      offsetPath: `rect(0 auto auto 0 round ${size}px)`,
      ...style
    }}
    animate={{
      offsetDistance: ["0%", "100%"]
    }}
    transition={transition || defaultTransition}
    onAnimationComplete={onAnimationComplete}
  />
    </div>;
}
export {
  BorderTrail
};
