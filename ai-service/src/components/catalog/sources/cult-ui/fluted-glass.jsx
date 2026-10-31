/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : cult-ui/fluted-glass
 * Source    : github.com/nolly-studio/cult-ui @ d71b1428b811 : apps/www/registry/default/ui/fluted-glass.tsx
 * License   : MIT, Copyright (c) 2023 Jordan-Gilliam
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import * as React from "react";
import { FlutedGlass as FlutedGlassShader } from "@paper-design/shaders-react";
import { cn } from "../../lib/utils.js";
const MemoizedFlutedGlass = React.memo(FlutedGlassShader);
const defaultFlutedGlassProps = {
  width: 1280,
  height: 720,
  image: "https://paper.design/flowers.webp",
  colorBack: "#00000000",
  colorShadow: "#000000",
  colorHighlight: "#ffffff",
  size: 0.5,
  shadows: 0.25,
  highlights: 0.1,
  shape: "lines",
  angle: 0,
  distortionShape: "prism",
  distortion: 0.5,
  shift: 0,
  stretch: 0,
  blur: 0,
  edges: 0.25,
  margin: 0,
  grainMixer: 0,
  grainOverlay: 0,
  fit: "cover"
};
const FlutedGlass = ({
  className,
  ...props
}) => <MemoizedFlutedGlass
  className={cn(className)}
  {...defaultFlutedGlassProps}
  {...props}
/>;
FlutedGlass.displayName = "FlutedGlass";
export {
  FlutedGlass,
  defaultFlutedGlassProps
};
