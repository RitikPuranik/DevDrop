/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : magicui/marquee
 * Source    : github.com/magicuidesign/magicui @ efe76fc5755e : apps/www/registry/magicui/marquee.tsx
 * License   : MIT, Copyright (c) Magic UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import "./Marquee.css";
import { cn } from "../../lib/utils.js";
function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
  ...props
}) {
  return <div
    {...props}
    className={cn(
      "group flex gap-(--gap) overflow-hidden p-2 [--duration:40s] [--gap:1rem]",
      {
        "flex-row": !vertical,
        "flex-col": vertical
      },
      className
    )}
  >
      {Array(repeat).fill(0).map((_, i) => <div
    key={i}
    className={cn("flex shrink-0 justify-around gap-(--gap)", {
      "animate-marquee flex-row": !vertical,
      "animate-marquee-vertical flex-col": vertical,
      "group-hover:[animation-play-state:paused]": pauseOnHover,
      "[animation-direction:reverse]": reverse
    })}
  >
            {children}
          </div>)}
    </div>;
}
export {
  Marquee
};
