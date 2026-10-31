/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : motion-primitives/infinite-slider
 * Source    : github.com/ibelick/motion-primitives @ 120f64f6ca60 : components/core/infinite-slider.tsx
 * License   : MIT, Copyright (c) 2024 ibelick
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { cn } from "../../lib/utils.js";
import { useMotionValue, animate, motion } from "motion/react";
import { useState, useEffect } from "react";
import useMeasure from "react-use-measure";
function InfiniteSlider({
  children,
  gap = 16,
  speed = 100,
  speedOnHover,
  direction = "horizontal",
  reverse = false,
  className
}) {
  const [isHovering, setIsHovering] = useState(false);
  const currentSpeed = isHovering && speedOnHover ? speedOnHover : speed;
  const [ref, { width, height }] = useMeasure();
  const translation = useMotionValue(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    let controls;
    const size = direction === "horizontal" ? width : height;
    const contentSize = size + gap;
    const from = reverse ? -contentSize / 2 : 0;
    const to = reverse ? 0 : -contentSize / 2;
    const distanceToTravel = Math.abs(to - from);
    const duration = distanceToTravel / currentSpeed;
    if (isTransitioning) {
      const remainingDistance = Math.abs(translation.get() - to);
      const transitionDuration = remainingDistance / currentSpeed;
      controls = animate(translation, [translation.get(), to], {
        ease: "linear",
        duration: transitionDuration,
        onComplete: () => {
          setIsTransitioning(false);
          setKey((prevKey) => prevKey + 1);
        }
      });
    } else {
      controls = animate(translation, [from, to], {
        ease: "linear",
        duration,
        repeat: Infinity,
        repeatType: "loop",
        repeatDelay: 0,
        onRepeat: () => {
          translation.set(from);
        }
      });
    }
    return controls?.stop;
  }, [
    key,
    translation,
    currentSpeed,
    width,
    height,
    gap,
    isTransitioning,
    direction,
    reverse
  ]);
  const hoverProps = speedOnHover ? {
    onHoverStart: () => {
      setIsTransitioning(true);
      setIsHovering(true);
    },
    onHoverEnd: () => {
      setIsTransitioning(true);
      setIsHovering(false);
    }
  } : {};
  return <div className={cn("overflow-hidden", className)}>
      <motion.div
    className='flex w-max'
    style={{
      ...direction === "horizontal" ? { x: translation } : { y: translation },
      gap: `${gap}px`,
      flexDirection: direction === "horizontal" ? "row" : "column"
    }}
    ref={ref}
    {...hoverProps}
  >
        {children}
        {children}
      </motion.div>
    </div>;
}
export {
  InfiniteSlider
};
