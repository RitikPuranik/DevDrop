/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : cult-ui/distorted-glass
 * Source    : github.com/nolly-studio/cult-ui @ d71b1428b811 : apps/www/registry/default/ui/distorted-glass.tsx
 * License   : MIT, Copyright (c) 2023 Jordan-Gilliam
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { cn } from "../../lib/utils.js";
const DistortedGlass = ({ className }) => {
  return <>
      <div
    className={cn(
      "relative hidden h-[50px] w-[360px] overflow-hidden rounded-b-2xl lg:w-[600px] xl:block xl:w-full",
      className
    )}
  >
        <div className="pointer-events-none absolute bottom-0 z-10 size-full overflow-hidden rounded-b-2xl border border-[#f5f5f51a]">
          <div className="glass-effect size-full" />
        </div>
        <svg>
          <title>Distorted Glass</title>
          <defs>
            <filter id="fractal-noise-glass">
              <feTurbulence
    type="fractalNoise"
    baseFrequency="0.12 0.12"
    numOctaves="1"
    result="warp"
  />
              <feDisplacementMap
    xChannelSelector="R"
    yChannelSelector="G"
    scale="30"
    in="SourceGraphic"
    in2="warp"
  />
            </filter>
          </defs>
        </svg>
      </div>

      <style jsx>{`
        .glass-effect {
          background: rgba(0, 0, 0, 0.2);
          background: repeating-radial-gradient(
            circle at 50%50%,
            rgb(255 255 255 / 0),
            rgba(255, 255, 255, 0.2) 10px,
            rgb(255 255 255) 31px
          );
          filter: url(#fractal-noise-glass);
          background-size: 6px 6px;
          backdrop-filter: blur(0px);
        }
      `}</style>
    </>;
};
export {
  DistortedGlass
};
