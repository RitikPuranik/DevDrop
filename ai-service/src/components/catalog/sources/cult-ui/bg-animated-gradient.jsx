/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : cult-ui/bg-animated-gradient
 * Source    : github.com/nolly-studio/cult-ui @ d71b1428b811 : apps/www/registry/default/ui/bg-animated-gradient.tsx
 * License   : MIT, Copyright (c) 2023 Jordan-Gilliam
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import React, { useEffect } from "react";
import { motion, useAnimation } from "motion/react";
const GradientAnimation = ({
  gradients,
  animationDuration,
  className = ""
}) => {
  const controls = useAnimation();
  useEffect(() => {
    controls.start({
      background: gradients.map(
        (g) => `radial-gradient(circle at ${g.centerX}% ${g.centerY}%, ${g.stops.map((s) => `${s.color} ${s.position}%`).join(", ")})`
      ),
      transition: {
        duration: animationDuration,
        repeat: Infinity,
        repeatType: "reverse",
        ease: "linear"
      }
    });
  }, [controls, gradients, animationDuration]);
  return <motion.div
    className={`absolute inset-0 h-full w-full ${className}`}
    animate={controls}
  />;
};
var bg_animated_gradient_default = React.memo(GradientAnimation);
export {
  GradientAnimation,
  bg_animated_gradient_default as default
};
