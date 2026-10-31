/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : magicui/meteors
 * Source    : github.com/magicuidesign/magicui @ efe76fc5755e : apps/www/registry/magicui/meteors.tsx
 * License   : MIT, Copyright (c) Magic UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import "./Meteors.css";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils.js";
const Meteors = ({
  number = 20,
  minDelay = 0.2,
  maxDelay = 1.2,
  minDuration = 2,
  maxDuration = 10,
  angle = 215,
  className
}) => {
  const [meteorStyles, setMeteorStyles] = useState(
    []
  );
  useEffect(() => {
    const styles = [...new Array(number)].map(() => ({
      "--angle": -angle + "deg",
      top: "-5%",
      left: `calc(0% + ${Math.floor(Math.random() * window.innerWidth)}px)`,
      animationDelay: Math.random() * (maxDelay - minDelay) + minDelay + "s",
      animationDuration: Math.floor(Math.random() * (maxDuration - minDuration) + minDuration) + "s"
    }));
    setMeteorStyles(styles);
  }, [number, minDelay, maxDelay, minDuration, maxDuration, angle]);
  return <>
      {[...meteorStyles].map((style, idx) => (
    // Meteor Head
    <span
      key={idx}
      style={{ ...style }}
      className={cn(
        "animate-meteor pointer-events-none absolute size-0.5 rotate-(--angle) rounded-full bg-zinc-500 shadow-[0_0_0_1px_#ffffff10]",
        className
      )}
    >
          {
      /* Meteor Tail */
    }
          <div className="pointer-events-none absolute top-1/2 -z-10 h-px w-12.5 -translate-y-1/2 bg-linear-to-r from-zinc-500 to-transparent" />
        </span>
  ))}
    </>;
};
export {
  Meteors
};
