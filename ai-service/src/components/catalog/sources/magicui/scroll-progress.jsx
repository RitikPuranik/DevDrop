/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : magicui/scroll-progress
 * Source    : github.com/magicuidesign/magicui @ efe76fc5755e : apps/www/registry/magicui/scroll-progress.tsx
 * License   : MIT, Copyright (c) Magic UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { motion, useScroll } from "motion/react";
import { cn } from "../../lib/utils.js";
function ScrollProgress({
  className,
  ref,
  ...props
}) {
  const { scrollYProgress } = useScroll();
  return <motion.div
    ref={ref}
    className={cn(
      "fixed inset-x-0 top-0 z-50 h-px origin-left bg-linear-to-r from-[#A97CF8] via-[#F38CB8] to-[#FDCC92]",
      className
    )}
    style={{
      scaleX: scrollYProgress
    }}
    {...props}
  />;
}
export {
  ScrollProgress
};
