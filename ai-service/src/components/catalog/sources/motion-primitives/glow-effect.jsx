/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : motion-primitives/glow-effect
 * Source    : github.com/ibelick/motion-primitives @ 120f64f6ca60 : components/core/glow-effect.tsx
 * License   : MIT, Copyright (c) 2024 ibelick
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { cn } from "../../lib/utils.js";
import { motion } from "motion/react";
function GlowEffect({
  className,
  style,
  colors = ["#FF5733", "#33FF57", "#3357FF", "#F1C40F"],
  mode = "rotate",
  blur = "medium",
  transition,
  scale = 1,
  duration = 5
}) {
  const BASE_TRANSITION = {
    repeat: Infinity,
    duration,
    ease: "linear"
  };
  const animations = {
    rotate: {
      background: [
        `conic-gradient(from 0deg at 50% 50%, ${colors.join(", ")})`,
        `conic-gradient(from 360deg at 50% 50%, ${colors.join(", ")})`
      ],
      transition: {
        ...transition ?? BASE_TRANSITION
      }
    },
    pulse: {
      background: colors.map(
        (color) => `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 100%)`
      ),
      scale: [1 * scale, 1.1 * scale, 1 * scale],
      opacity: [0.5, 0.8, 0.5],
      transition: {
        ...transition ?? {
          ...BASE_TRANSITION,
          repeatType: "mirror"
        }
      }
    },
    breathe: {
      background: [
        ...colors.map(
          (color) => `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 100%)`
        )
      ],
      scale: [1 * scale, 1.05 * scale, 1 * scale],
      transition: {
        ...transition ?? {
          ...BASE_TRANSITION,
          repeatType: "mirror"
        }
      }
    },
    colorShift: {
      background: colors.map((color, index) => {
        const nextColor = colors[(index + 1) % colors.length];
        return `conic-gradient(from 0deg at 50% 50%, ${color} 0%, ${nextColor} 50%, ${color} 100%)`;
      }),
      transition: {
        ...transition ?? {
          ...BASE_TRANSITION,
          repeatType: "mirror"
        }
      }
    },
    flowHorizontal: {
      background: colors.map((color) => {
        const nextColor = colors[(colors.indexOf(color) + 1) % colors.length];
        return `linear-gradient(to right, ${color}, ${nextColor})`;
      }),
      transition: {
        ...transition ?? {
          ...BASE_TRANSITION,
          repeatType: "mirror"
        }
      }
    },
    static: {
      background: `linear-gradient(to right, ${colors.join(", ")})`
    }
  };
  const getBlurClass = (blur2) => {
    if (typeof blur2 === "number") {
      return `blur-[${blur2}px]`;
    }
    const presets = {
      softest: "blur-xs",
      soft: "blur-sm",
      medium: "blur-md",
      strong: "blur-lg",
      stronger: "blur-xl",
      strongest: "blur-xl",
      none: "blur-none"
    };
    return presets[blur2];
  };
  return <motion.div
    style={{
      ...style,
      "--scale": scale,
      willChange: "transform",
      backfaceVisibility: "hidden"
    }}
    animate={animations[mode]}
    className={cn(
      "pointer-events-none absolute inset-0 h-full w-full",
      "scale-[var(--scale)] transform-gpu",
      getBlurClass(blur),
      className
    )}
  />;
}
export {
  GlowEffect
};
