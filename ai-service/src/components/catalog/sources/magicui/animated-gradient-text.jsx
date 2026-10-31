/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : magicui/animated-gradient-text
 * Source    : github.com/magicuidesign/magicui @ efe76fc5755e : apps/www/registry/magicui/animated-gradient-text.tsx
 * License   : MIT, Copyright (c) Magic UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import "./AnimatedGradientText.css";
import { cn } from "../../lib/utils.js";
function AnimatedGradientText({
  children,
  className,
  speed = 1,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  ...props
}) {
  return <span
    style={{
      "--bg-size": `${speed * 300}%`,
      "--color-from": colorFrom,
      "--color-to": colorTo
    }}
    className={cn(
      `animate-gradient inline bg-linear-to-r from-(--color-from) via-(--color-to) to-(--color-from) bg-size-[var(--bg-size)_100%] bg-clip-text text-transparent`,
      className
    )}
    {...props}
  >
      {children}
    </span>;
}
export {
  AnimatedGradientText
};
