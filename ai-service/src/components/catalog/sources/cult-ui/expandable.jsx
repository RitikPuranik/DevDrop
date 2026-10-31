/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : cult-ui/expandable
 * Source    : github.com/nolly-studio/cult-ui @ d71b1428b811 : apps/www/registry/default/ui/expandable.tsx
 * License   : MIT, Copyright (c) 2023 Jordan-Gilliam
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring
} from "motion/react";
import useMeasure from "react-use-measure";
import { cn } from "../../lib/utils.js";
const springConfig = { stiffness: 200, damping: 20, bounce: 0.2 };
const ExpandableContext = createContext({
  isExpanded: false,
  toggleExpand: () => {
  },
  expandDirection: "vertical",
  // 'vertical' | 'horizontal' | 'both' // Direction of expansion
  expandBehavior: "replace",
  // How the expansion affects surrounding content
  transitionDuration: 0.3,
  // Duration of the expansion/collapse animation
  easeType: "easeInOut",
  // Easing function for the animation
  initialDelay: 0
});
const useExpandable = () => useContext(ExpandableContext);
const Expandable = React.forwardRef(
  ({
    children,
    expanded,
    onToggle,
    transitionDuration = 0.3,
    easeType = "easeInOut",
    expandDirection = "vertical",
    expandBehavior = "replace",
    initialDelay = 0,
    onExpandStart,
    onExpandEnd,
    onCollapseStart,
    onCollapseEnd,
    ...props
  }, ref) => {
    const [isExpandedInternal, setIsExpandedInternal] = useState(false);
    const isExpanded = expanded !== void 0 ? expanded : isExpandedInternal;
    const toggleExpand = onToggle || (() => setIsExpandedInternal((prev) => !prev));
    useEffect(() => {
      if (isExpanded) {
        onExpandStart?.();
      } else {
        onCollapseStart?.();
      }
    }, [isExpanded, onExpandStart, onCollapseStart]);
    const contextValue = {
      isExpanded,
      toggleExpand,
      expandDirection,
      expandBehavior,
      transitionDuration,
      easeType,
      initialDelay,
      onExpandEnd,
      onCollapseEnd
    };
    return <ExpandableContext.Provider value={contextValue}>
        <motion.div
      ref={ref}
      initial={false}
      transition={{
        duration: transitionDuration,
        ease: easeType,
        delay: initialDelay
      }}
      {...props}
    >
          {
      /* Render children as a function if provided, otherwise render as is */
    }
          {typeof children === "function" ? children({ isExpanded }) : children}
        </motion.div>
      </ExpandableContext.Provider>;
  }
);
const ANIMATION_PRESETS = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  },
  "slide-up": {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 }
  },
  "slide-down": {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  },
  "slide-left": {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 }
  },
  "slide-right": {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  },
  scale: {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 }
  },
  rotate: {
    initial: { opacity: 0, rotate: -10 },
    animate: { opacity: 1, rotate: 0 },
    exit: { opacity: 0, rotate: -10 }
  },
  "blur-sm": {
    initial: { opacity: 0, filter: "blur(4px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(4px)" }
  },
  "blur-md": {
    initial: { opacity: 0, filter: "blur(8px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(8px)" }
  },
  "blur-lg": {
    initial: { opacity: 0, filter: "blur(16px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(16px)" }
  }
};
const getAnimationProps = (preset, animateIn, animateOut) => {
  const defaultAnimation = {
    initial: {},
    animate: {},
    exit: {}
  };
  const presetAnimation = preset ? ANIMATION_PRESETS[preset] : defaultAnimation;
  return {
    initial: presetAnimation.initial,
    animate: presetAnimation.animate,
    exit: animateOut?.exit || presetAnimation.exit
  };
};
const ExpandableContent = React.forwardRef(
  ({
    children,
    preset,
    animateIn,
    animateOut,
    stagger = false,
    staggerChildren = 0.1,
    keepMounted = false,
    ...props
  }, ref) => {
    const { isExpanded, transitionDuration, easeType } = useExpandable();
    const [measureRef, { height: measuredHeight }] = useMeasure();
    const animatedHeight = useMotionValue(0);
    const smoothHeight = useSpring(animatedHeight, springConfig);
    useEffect(() => {
      if (isExpanded) {
        animatedHeight.set(measuredHeight);
      } else {
        animatedHeight.set(0);
      }
    }, [isExpanded, measuredHeight, animatedHeight]);
    const animationProps = getAnimationProps(preset, animateIn, animateOut);
    return (
      // This motion.div animates the height of the content
      <motion.div
        ref={ref}
        style={{
          height: smoothHeight,
          overflow: "hidden"
        }}
        transition={{ duration: transitionDuration, ease: easeType }}
        {...props}
      >
        {
        /* AnimatePresence handles the entering and exiting of components */
      }
        <AnimatePresence initial={false}>
          {(isExpanded || keepMounted) && // This motion.div handles the animation of the content itself
      <motion.div
        ref={measureRef}
        initial={animationProps.initial}
        animate={animationProps.animate}
        exit={animationProps.exit}
        transition={{ duration: transitionDuration, ease: easeType }}
      >
              {stagger ? (
        // If stagger is true, we apply a staggered animation to the children
        <motion.div
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren
              }
            }
          }}
          initial="hidden"
          animate="visible"
        >
                  {React.Children.map(
          children,
          (child, index) => <motion.div
            key={`${child?.toLocaleString}-${index}`}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 }
            }}
          >
                        {child}
                      </motion.div>
        )}
                </motion.div>
      ) : children}
            </motion.div>}
        </AnimatePresence>
      </motion.div>
    );
  }
);
const ExpandableCard = React.forwardRef(
  ({
    children,
    className = "",
    collapsedSize = { width: 320, height: 211 },
    expandedSize = { width: 480, height: void 0 },
    hoverToExpand = false,
    expandDelay = 0,
    collapseDelay = 0,
    ...props
  }, ref) => {
    const { isExpanded, toggleExpand, expandDirection } = useExpandable();
    const [measureRef, { width, height }] = useMeasure();
    const animatedWidth = useMotionValue(collapsedSize.width || 0);
    const animatedHeight = useMotionValue(collapsedSize.height || 0);
    const smoothWidth = useSpring(animatedWidth, springConfig);
    const smoothHeight = useSpring(animatedHeight, springConfig);
    useEffect(() => {
      if (isExpanded) {
        animatedWidth.set(expandedSize.width || width);
        animatedHeight.set(expandedSize.height || height);
      } else {
        animatedWidth.set(collapsedSize.width || width);
        animatedHeight.set(collapsedSize.height || height);
      }
    }, [
      isExpanded,
      collapsedSize,
      expandedSize,
      width,
      height,
      animatedWidth,
      animatedHeight
    ]);
    const handleHover = () => {
      if (hoverToExpand && !isExpanded) {
        setTimeout(toggleExpand, expandDelay);
      }
    };
    const handleHoverEnd = () => {
      if (hoverToExpand && isExpanded) {
        setTimeout(toggleExpand, collapseDelay);
      }
    };
    return <motion.div
      ref={ref}
      className={cn("cursor-pointer", className)}
      style={{
        // Set width and height based on expansion direction
        width: expandDirection === "vertical" ? collapsedSize.width : smoothWidth,
        height: expandDirection === "horizontal" ? collapsedSize.height : smoothHeight
      }}
      transition={springConfig}
      onHoverStart={handleHover}
      onHoverEnd={handleHoverEnd}
      {...props}
    >
        <div
      className={cn(
        "grid grid-cols-1 rounded-lg sm:rounded-xl md:rounded-[2rem]",
        "shadow-[inset_0_0_1px_1px_hsl(var(--border)/0.3)] dark:shadow-[inset_0_0_1px_1px_hsl(var(--border)/0.5)]",
        "sm:shadow-[inset_0_0_2px_1px_hsl(var(--border)/0.3)] dark:sm:shadow-[inset_0_0_2px_1px_hsl(var(--border)/0.5)]",
        "ring-border/50 ring-1",
        "max-w-[calc(100%-1rem)] sm:max-w-[calc(100%-2rem)] md:max-w-[calc(100%-4rem)]",
        "mx-auto w-full",
        "transition-all duration-300 ease-in-out"
      )}
    >
          {
      /* Nested divs purely for styling and layout (the shadow ring around the card) */
    }
          <div className="grid grid-cols-1 rounded-lg p-1 shadow-md sm:rounded-xl sm:p-1.5 md:rounded-[2rem] md:p-2">
            <div className="dark:bg-muted ring-border/50 rounded-md bg-white p-2 shadow-xl ring-1 sm:rounded-lg sm:p-3 md:rounded-3xl md:p-4">
              <div className="h-full w-full overflow-hidden">
                {
      /* Ref for measuring content dimensions (so we can let framer know to animate into the dimensions) */
    }
                <div ref={measureRef} className="flex h-full flex-col">
                  {children}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>;
  }
);
ExpandableCard.displayName = "ExpandableCard";
const ExpandableTrigger = React.forwardRef(({ children, className, ...props }, ref) => {
  const { toggleExpand } = useExpandable();
  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpand();
    }
  };
  return <div
    ref={ref}
    onClick={toggleExpand}
    onKeyDown={handleKeyDown}
    role="button"
    tabIndex={0}
    aria-label="Toggle expand"
    className={cn("cursor-pointer", className)}
    {...props}
  >
      {children}
    </div>;
});
ExpandableTrigger.displayName = "ExpandableTrigger";
const ExpandableCardHeader = React.forwardRef(({ className, children, ...props }, ref) => <div
  ref={ref}
  className={cn("flex flex-col space-y-1.5 p-6", className)}
  {...props}
>
    <motion.div layout className="flex items-start justify-between">
      {children}
    </motion.div>
  </div>);
ExpandableCardHeader.displayName = "ExpandableCardHeader";
const ExpandableCardContent = React.forwardRef(({ className, children, ...props }, ref) => <div
  ref={ref}
  className={cn("flex-grow overflow-hidden p-6 px-4 pt-0", className)}
  {...props}
>
    <motion.div layout>{children}</motion.div>
  </div>);
ExpandableCardContent.displayName = "ExpandableCardContent";
const ExpandableCardFooter = React.forwardRef(({ className, ...props }, ref) => <div
  ref={ref}
  className={cn("flex items-center p-4 pt-0", className)}
  {...props}
/>);
ExpandableCardFooter.displayName = "ExpandableCardFooter";
export {
  Expandable,
  ExpandableCard,
  ExpandableCardContent,
  ExpandableCardFooter,
  ExpandableCardHeader,
  ExpandableContent,
  ExpandableContext,
  ExpandableTrigger,
  useExpandable
};
