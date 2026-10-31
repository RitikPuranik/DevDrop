/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : cult-ui/text-gif
 * Source    : github.com/nolly-studio/cult-ui @ d71b1428b811 : apps/www/registry/default/ui/text-gif.tsx
 * License   : MIT, Copyright (c) 2023 Jordan-Gilliam
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";
const textBaseVariants = cva("", {
  variants: {
    size: {
      default: "text-2xl sm:text-3xl lg:text-4xl",
      xxs: "text-base sm:text-lg lg:text-lg",
      xs: "text-lg sm:text-xl lg:text-2xl",
      sm: "text-xl sm:text-2xl lg:text-3xl",
      md: "text-2xl sm:text-3xl lg:text-4xl",
      lg: "text-3xl sm:text-4xl lg:text-5xl",
      xl: "text-4xl sm:text-5xl lg:text-6xl",
      xxl: "text-[2.5rem] sm:text-6xl lg:text-[6rem]",
      xll: "text-5xl sm:text-6xl lg:text-[7rem]",
      xxxl: "text-[6rem] leading-5 sm:text-6xl lg:text-[8rem] lg:leading-8"
    },
    weight: {
      default: "font-bold",
      thin: "font-thin",
      base: "font-base",
      semi: "font-semibold",
      bold: "font-bold",
      black: "font-black"
    },
    font: {
      default: "font-sansTight",
      serif: "font-serif",
      mono: "font-mono"
    }
  },
  defaultVariants: {
    size: "default",
    weight: "bold",
    font: "default"
  }
});
const TextGif = React.memo(function TextGifComponent({
  gifUrl,
  text,
  size,
  weight,
  font,
  className,
  fallbackColor = "black",
  transitionDuration = 300
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [gifUrl]);
  const textClassName = useMemo(
    () => cn(
      textBaseVariants({ size, weight, font }),
      loaded && !error ? "bg-clip-text text-transparent" : "",
      className,
      "pb-1.5 md:pb-4"
    ),
    [size, weight, font, className, loaded, error]
  );
  const textStyle = useMemo(() => {
    const style = {
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      WebkitBackgroundClip: "text",
      lineHeight: 1,
      textAlign: "center",
      color: fallbackColor,
      // Always set the fallback color initially
      WebkitTextFillColor: fallbackColor,
      // Safari fix
      transition: `background-image ${transitionDuration}ms ease-in-out, color ${transitionDuration}ms ease-in-out`
    };
    if (loaded && !error) {
      style.backgroundImage = `url(${gifUrl})`;
      style.color = "transparent";
      style.WebkitTextFillColor = "transparent";
    }
    return style;
  }, [loaded, error, gifUrl, transitionDuration, fallbackColor]);
  return <div className="relative inline-block">
      {
    /* Hidden image for preloading */
  }
      {gifUrl && <Image
    src={gifUrl || "/placeholder.svg"}
    alt=""
    width={1}
    height={1}
    className="pointer-events-none absolute opacity-0"
    onLoad={() => {
      setLoaded(true);
      setError(false);
    }}
    onError={() => {
      setError(true);
      setLoaded(false);
    }}
    priority
    unoptimized
  />}
      <span className={textClassName} style={textStyle}>
        {text}
      </span>
    </div>;
});
const gifUrls = [
  "https://media.giphy.com/media/3zvbrvbRe7wxBofOBI/giphy.gif",
  "https://media.giphy.com/media/fnglNFjBGiyAFtm6ke/giphy.gif",
  "https://media.giphy.com/media/9Pmfazv34l7aNIKK05/giphy.gif",
  "https://media.giphy.com/media/4bhs1boql4XVJgmm4H/giphy.gif"
];
function PreloadGifs() {
  return <div className="hidden">
      {gifUrls.map((url) => <Image
    key={url}
    src={url}
    alt=""
    width={1}
    height={1}
    priority
    unoptimized
  />)}
    </div>;
}
var text_gif_default = TextGif;
export {
  TextGif,
  text_gif_default as default
};
