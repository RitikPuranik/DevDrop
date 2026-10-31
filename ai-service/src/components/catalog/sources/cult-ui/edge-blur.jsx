/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : cult-ui/edge-blur
 * Source    : github.com/nolly-studio/cult-ui @ d71b1428b811 : apps/www/registry/default/ui/edge-blur.tsx
 * License   : MIT, Copyright (c) 2023 Jordan-Gilliam
 * Full text : /THIRD_PARTY_NOTICES.md
 */
function EdgeBlur({ position = "bottom", height = 75 }) {
  const blurLayers = [1, 2, 3, 6, 12];
  const isTop = position === "top";
  return <div
    className={`pointer-events-none fixed inset-x-0 isolate z-40 ${isTop ? "top-0" : "bottom-0"}`}
    style={{ height }}
  >
      {blurLayers.map((blur) => <div
    key={blur}
    className="absolute inset-0"
    style={{
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
      maskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, black, transparent)`,
      WebkitMaskImage: `linear-gradient(to ${isTop ? "bottom" : "top"}, black, transparent)`
    }}
  />)}
    </div>;
}
function TopBlur({ height = 75 }) {
  return <EdgeBlur position="top" height={height} />;
}
function BottomBlur({ height = 75 }) {
  return <EdgeBlur position="bottom" height={height} />;
}
export {
  BottomBlur,
  EdgeBlur,
  TopBlur
};
