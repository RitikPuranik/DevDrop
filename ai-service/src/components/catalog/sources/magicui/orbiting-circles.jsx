/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : magicui/orbiting-circles
 * Source    : github.com/magicuidesign/magicui @ efe76fc5755e : apps/www/registry/magicui/orbiting-circles.tsx
 * License   : MIT, Copyright (c) Magic UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import "./OrbitingCircles.css";
import React from "react";
import { cn } from "../../lib/utils.js";
function OrbitingCircles({
  className,
  children,
  reverse,
  duration = 20,
  radius = 160,
  path = true,
  iconSize = 30,
  speed = 1,
  ...props
}) {
  const calculatedDuration = duration / speed;
  return <>
      {path && <svg
    xmlns="http://www.w3.org/2000/svg"
    version="1.1"
    className="pointer-events-none absolute inset-0 size-full"
  >
          <circle
    className="stroke-black/10 stroke-1 dark:stroke-white/10"
    cx="50%"
    cy="50%"
    r={radius}
    fill="none"
  />
        </svg>}
      {React.Children.map(children, (child, index) => {
    const angle = 360 / React.Children.count(children) * index;
    return <div
      style={{
        "--duration": calculatedDuration,
        "--radius": radius,
        "--angle": angle,
        "--icon-size": `${iconSize}px`
      }}
      className={cn(
        `animate-orbit absolute flex size-(--icon-size) transform-gpu items-center justify-center rounded-full`,
        { "[animation-direction:reverse]": reverse },
        className
      )}
      {...props}
    >
            {child}
          </div>;
  })}
    </>;
}
export {
  OrbitingCircles
};
