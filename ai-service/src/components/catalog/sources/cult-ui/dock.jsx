/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : cult-ui/dock
 * Source    : github.com/nolly-studio/cult-ui @ d71b1428b811 : apps/www/registry/default/ui/dock.tsx
 * License   : MIT, Copyright (c) 2023 Jordan-Gilliam
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  animate,
  AnimatePresence,
  motion,
  useAnimation,
  useMotionValue,
  useSpring,
  useTransform
} from "motion/react";
import { cn } from "../../lib/utils.js";
const INITIAL_WIDTH = 48;
const DockContext = createContext({
  width: 0,
  hovered: false,
  setIsZooming: () => {
  },
  zoomLevel: null,
  mouseX: null,
  animatingIndexes: [],
  setAnimatingIndexes: () => {
  }
});
const useDock = () => useContext(DockContext);
function Dock({ className, children }) {
  const [hovered, setHovered] = useState(false);
  const [width, setWidth] = useState(0);
  const dockRef = useRef(null);
  const isZooming = useRef(false);
  const [animatingIndexes, setAnimatingIndexes] = useState([]);
  const setIsZooming = useCallback((value) => {
    isZooming.current = value;
    setHovered(!value);
  }, []);
  const zoomLevel = useMotionValue(1);
  useWindowResize(() => {
    setWidth(dockRef.current?.clientWidth || 0);
  });
  const mouseX = useMotionValue(Infinity);
  return (
    // Provide the dock's state and control methods to the rest of the application through context.
    <DockContext.Provider
      value={{
        hovered,
        // Current hover state of the dock
        setIsZooming,
        // Method to set the zooming state
        width,
        // Current width of the dock
        zoomLevel,
        // Current zoom level motion value
        mouseX,
        // Current mouse X position motion value
        animatingIndexes,
        // Current animating indexes
        setAnimatingIndexes
        // Method to set animating indexes
      }}
    >
      <motion.div
      ref={dockRef}
      className={cn(
        "bg-opacity-90 absolute bottom-4 left-3/4 flex h-14 -translate-x-1/2 transform items-end gap-3 rounded-xl p-2",
        "bg-neutral-50 p-2 no-underline shadow-sm transition-colors hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800/80",
        "shadow-[0px_1px_1px_0px_rgba(0,0,0,0.05),0px_1px_1px_0px_rgba(255,252,240,0.5)_inset,0px_0px_0px_1px_hsla(0,0%,100%,0.1)_inset,0px_0px_1px_0px_rgba(28,27,26,0.5)]",
        "shadow-[rgba(17,24,28,0.08)_0_0_0_1px,rgba(17,24,28,0.08)_0_1px_2px_-1px,rgba(17,24,28,0.04)_0_2px_4px]",
        "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(0,0,0,0.1),0_2px_2px_0_rgba(0,0,0,0.1),0_4px_4px_0_rgba(0,0,0,0.1),0_8px_8px_0_rgba(0,0,0,0.1)]",
        className
      )}
      onMouseMove={(e) => {
        mouseX.set(e.pageX);
        if (!isZooming.current) {
          setHovered(true);
        }
      }}
      onMouseLeave={() => {
        mouseX.set(Infinity);
        setHovered(false);
      }}
      style={{
        x: "-50%",
        // Center the dock horizontally
        scale: zoomLevel
        // Bind the zoom level to the scale style property
      }}
    >
        {children} {
      /* Render the dock's children within the motion div */
    }
      </motion.div>
    </DockContext.Provider>
  );
}
function DockCardInner({ src, id, children }) {
  const { animatingIndexes } = useDock();
  return <span className="relative z-0 flex h-full w-full items-center justify-center overflow-hidden rounded-md">
      {
    /* Background image with a blur effect to give a depth illusion */
  }
      <motion.img
    className="absolute z-10 translate-y-2.5 scale-125 transform opacity-40 blur-md filter"
    src={src}
    alt=""
  />

      {
    /* AnimatePresence component to handle the entrance and exit animations of children - in our case, the "openIcon" */
  }
      <AnimatePresence>
        {animatingIndexes.includes(parseInt(id)) && children ? <motion.div
    className="relative z-0 h-full w-full rounded-full"
    initial={{ scale: 0, opacity: 0, filter: "blur(4px)" }}
    animate={{
      scale: 1,
      opacity: 1,
      filter: "blur(0px)",
      transition: { type: "spring", delay: 0.2 }
      // Animation to spring into place with a delay so our layoutId animations can be smooth
    }}
    exit={{
      scale: 0,
      opacity: 0,
      filter: "blur(4px)",
      transition: { duration: 0 }
      // Exit animation with no delay
    }}
  >
            <div className="flex h-full w-full flex-col items-center justify-center">
              {
    /* Render the openIcon */
  }
              {children}
            </div>
          </motion.div> : null}
      </AnimatePresence>

      {
    /* Another AnimatePresence to handle layout animations */
  }
      <AnimatePresence mode="popLayout">
        {!animatingIndexes.includes(parseInt(id)) ? <motion.img
    layoutId={id}
    className="relative z-0 h-1/2 w-1/2 rounded-full border border-black/30 dark:border-white/10"
    src={src}
    alt=""
  /> : null}
      </AnimatePresence>
    </span>;
}
function DockCard({ children, id }) {
  const cardRef = useRef(null);
  const [elCenterX, setElCenterX] = useState(0);
  const dock = useDock();
  const size = useSpring(INITIAL_WIDTH, {
    stiffness: 320,
    damping: 20,
    mass: 0.1
  });
  const opacity = useSpring(0, {
    stiffness: 300,
    damping: 20
  });
  useMousePosition(
    {
      onChange: ({ value }) => {
        const mouseX = value.x;
        if (dock.width > 0) {
          const transformedValue = INITIAL_WIDTH + 36 * Math.cos((mouseX - elCenterX) / dock.width * Math.PI / 2) ** 12;
          if (dock.hovered) {
            animate(size, transformedValue);
          }
        }
      }
    },
    [elCenterX, dock]
  );
  useWindowResize(() => {
    const { x } = cardRef.current?.getBoundingClientRect() || { x: 0 };
    setElCenterX(x + 24);
  });
  const isAnimating = useRef(false);
  const controls = useAnimation();
  const timeoutRef = useRef(null);
  const handleClick = () => {
    if (!isAnimating.current) {
      isAnimating.current = true;
      dock.setAnimatingIndexes([...dock.animatingIndexes, parseInt(id)]);
      opacity.set(0.5);
      controls.start({
        y: -24,
        // Move the card up by 24 pixels
        transition: {
          repeat: Infinity,
          // Repeat the animation indefinitely
          repeatType: "reverse",
          // Reverse the direction of the animation each cycle
          duration: 0.5
          // Duration of each cycle
        }
      });
    } else {
      isAnimating.current = false;
      dock.setAnimatingIndexes(
        dock.animatingIndexes.filter((index) => index !== parseInt(id))
      );
      opacity.set(0);
      controls.start({
        y: 0,
        // Reset Y position to the original state
        transition: { duration: 0.5 }
        // Smooth transition back to original state
      });
    }
  };
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);
  const distance = useTransform(dock.mouseX, (val) => {
    const bounds = cardRef.current?.getBoundingClientRect() ?? {
      x: 0,
      width: 0
    };
    return val - bounds.x - bounds.width / 2;
  });
  let widthSync = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  let width = useSpring(widthSync, { mass: 0.1, stiffness: 150, damping: 12 });
  return <div className="flex flex-col items-center gap-1" key={id}>
      {
    /* Motion button for the card, handling click events and animations */
  }
      <motion.button
    ref={cardRef}
    className="border-opacity-10 transition-filter aspect-square rounded-lg border border-black/5 bg-neutral-100 brightness-90 saturate-90 duration-200 hover:brightness-112 hover:saturate-100 dark:border-white/5 dark:bg-neutral-800"
    onClick={handleClick}
    style={{
      width
      // Responsive width based on mouse distance
    }}
    animate={controls}
    whileTap={{ scale: 0.95 }}
  >
        {children}{" "}
        {
    /* Render the children of the DockCard inside the motion button */
  }
      </motion.button>

      {
    /* AnimatePresence to manage the presence and layout animations of the card's indicator */
  }
      <AnimatePresence mode="popLayout">
        {dock.animatingIndexes.includes(parseInt(id)) ? <motion.div
    key={id}
    layoutId={id}
    className="rounded-full"
    style={{ opacity }}
  >
            <motion.div
    exit={{ transition: { duration: 0 } }}
    className="h-1.5 w-1.5 rounded-full bg-black dark:bg-white"
    style={{ opacity }}
  />
          </motion.div> : null}
      </AnimatePresence>
    </div>;
}
function DockDivider() {
  return <motion.div
    className="flex h-full cursor-ns-resize items-center p-1.5"
    drag="y"
    dragConstraints={{ top: -100, bottom: 50 }}
  >
      <span className="h-full w-0.5 rounded bg-neutral-800/10 dark:bg-neutral-100/10" />
    </motion.div>;
}
function useWindowResize(callback) {
  const callbackRef = useCallbackRef(callback);
  useEffect(() => {
    const handleResize = () => {
      callbackRef(window.innerWidth, window.innerHeight);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [callbackRef]);
}
function useCallbackRef(callback) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  return useMemo(() => ((...args) => callbackRef.current?.(...args)), []);
}
function useMousePosition(options = {}, deps = []) {
  const { onChange } = options;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  useEffect(() => {
    const handleMouseMove = (event) => {
      animate(x, event.clientX);
      animate(y, event.clientY);
    };
    const handleChange = () => {
      if (onChange) {
        onChange({ value: { x: x.get(), y: y.get() } });
      }
    };
    const unsubscribeX = x.on("change", handleChange);
    const unsubscribeY = y.on("change", handleChange);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      unsubscribeX();
      unsubscribeY();
    };
  }, [x, y, onChange, ...deps]);
  return useMemo(
    () => ({
      x,
      // Motion value for x coordinate
      y
      // Motion value for y coordinate
    }),
    [x, y]
    // Dependencies for the memoized return value
  );
}
var dock_default = Dock;
export {
  Dock,
  DockCard,
  DockCardInner,
  DockDivider,
  dock_default as default,
  useDock,
  useMousePosition
};
