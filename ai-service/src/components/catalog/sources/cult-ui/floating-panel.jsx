/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : cult-ui/floating-panel
 * Source    : github.com/nolly-studio/cult-ui @ d71b1428b811 : apps/www/registry/default/ui/floating-panel.tsx
 * License   : MIT, Copyright (c) 2023 Jordan-Gilliam
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import { ArrowLeftIcon } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { cn } from "../../lib/utils.js";
const TRANSITION = {
  type: "spring",
  bounce: 0.1,
  duration: 0.4
};
const FloatingPanelContext = createContext(void 0);
function useFloatingPanel() {
  const context = useContext(FloatingPanelContext);
  if (!context) {
    throw new Error(
      "useFloatingPanel must be used within a FloatingPanelProvider"
    );
  }
  return context;
}
function useFloatingPanelLogic() {
  const uniqueId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [triggerRect, setTriggerRect] = useState(null);
  const [title, setTitle] = useState("");
  const openFloatingPanel = (rect) => {
    setTriggerRect(rect);
    setIsOpen(true);
  };
  const closeFloatingPanel = () => {
    setIsOpen(false);
    setNote("");
  };
  return {
    isOpen,
    openFloatingPanel,
    closeFloatingPanel,
    uniqueId,
    note,
    setNote,
    triggerRect,
    title,
    setTitle
  };
}
function FloatingPanelRoot({
  children,
  className
}) {
  const floatingPanelLogic = useFloatingPanelLogic();
  return <FloatingPanelContext.Provider value={floatingPanelLogic}>
      <MotionConfig transition={TRANSITION}>
        <div className={cn("relative", className)}>{children}</div>
      </MotionConfig>
    </FloatingPanelContext.Provider>;
}
function FloatingPanelTrigger({
  children,
  className,
  title
}) {
  const { openFloatingPanel, uniqueId, setTitle } = useFloatingPanel();
  const triggerRef = useRef(null);
  const handleClick = () => {
    if (triggerRef.current) {
      openFloatingPanel(triggerRef.current.getBoundingClientRect());
      setTitle(title);
    }
  };
  return <motion.button
    ref={triggerRef}
    layoutId={`floating-panel-trigger-${uniqueId}`}
    className={cn(
      "flex h-9 items-center border border-zinc-950/10 bg-white px-3 text-zinc-950 dark:border-zinc-50/10 dark:bg-zinc-700 dark:text-zinc-50",
      className
    )}
    style={{ borderRadius: 8 }}
    onClick={handleClick}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    aria-haspopup="dialog"
    aria-expanded={false}
  >
      <motion.div
    layoutId={`floating-panel-label-container-${uniqueId}`}
    className="flex items-center"
  >
        <motion.span
    layoutId={`floating-panel-label-${uniqueId}`}
    className="text-sm font-semibold"
  >
          {children}
        </motion.span>
      </motion.div>
    </motion.button>;
}
function FloatingPanelContent({
  children,
  className
}) {
  const { isOpen, closeFloatingPanel, uniqueId, triggerRect, title } = useFloatingPanel();
  const contentRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contentRef.current && !contentRef.current.contains(event.target)) {
        closeFloatingPanel();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeFloatingPanel]);
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeFloatingPanel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeFloatingPanel]);
  const variants = {
    hidden: { opacity: 0, scale: 0.9, y: 10 },
    visible: { opacity: 1, scale: 1, y: 0 }
  };
  return <AnimatePresence>
      {isOpen && <>
          <motion.div
    initial={{ backdropFilter: "blur(0px)" }}
    animate={{ backdropFilter: "blur(4px)" }}
    exit={{ backdropFilter: "blur(0px)" }}
    className="fixed inset-0 z-40"
  />
          <motion.div
    ref={contentRef}
    layoutId={`floating-panel-${uniqueId}`}
    className={cn(
      "fixed z-50 overflow-hidden border border-zinc-950/10 bg-white shadow-lg outline-none dark:border-zinc-50/10 dark:bg-zinc-800",
      className
    )}
    style={{
      borderRadius: 12,
      left: triggerRect ? triggerRect.left : "50%",
      top: triggerRect ? triggerRect.bottom + 8 : "50%",
      transformOrigin: "top left"
    }}
    initial="hidden"
    animate="visible"
    exit="hidden"
    variants={variants}
    role="dialog"
    aria-modal="true"
    aria-labelledby={`floating-panel-title-${uniqueId}`}
  >
            <FloatingPanelTitle>{title}</FloatingPanelTitle>
            {children}
          </motion.div>
        </>}
    </AnimatePresence>;
}
function FloatingPanelTitle({ children }) {
  const { uniqueId } = useFloatingPanel();
  return <motion.div
    layoutId={`floating-panel-label-container-${uniqueId}`}
    className="bg-white px-4 py-2 dark:bg-zinc-800"
  >
      <motion.div
    layoutId={`floating-panel-label-${uniqueId}`}
    className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
    id={`floating-panel-title-${uniqueId}`}
  >
        {children}
      </motion.div>
    </motion.div>;
}
function FloatingPanelForm({
  children,
  onSubmit,
  className
}) {
  const { note, closeFloatingPanel } = useFloatingPanel();
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.(note);
    closeFloatingPanel();
  };
  return <form
    className={cn("flex h-full flex-col", className)}
    onSubmit={handleSubmit}
  >
      {children}
    </form>;
}
function FloatingPanelLabel({
  children,
  htmlFor,
  className
}) {
  const { note } = useFloatingPanel();
  return <motion.label
    htmlFor={htmlFor}
    style={{ opacity: note ? 0 : 1 }}
    className={cn(
      "mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100",
      className
    )}
  >
      {children}
    </motion.label>;
}
function FloatingPanelTextarea({
  className,
  id
}) {
  const { note, setNote } = useFloatingPanel();
  return <textarea
    id={id}
    className={cn(
      "h-full w-full resize-none rounded-md bg-transparent px-4 py-3 text-sm outline-none",
      className
    )}
    autoFocus
    value={note}
    onChange={(e) => setNote(e.target.value)}
  />;
}
function FloatingPanelHeader({
  children,
  className
}) {
  return <motion.div
    className={cn(
      "px-4 py-2 font-semibold text-zinc-900 dark:text-zinc-100",
      className
    )}
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.1 }}
  >
      {children}
    </motion.div>;
}
function FloatingPanelBody({
  children,
  className
}) {
  return <motion.div
    className={cn("p-4", className)}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.2 }}
  >
      {children}
    </motion.div>;
}
function FloatingPanelFooter({
  children,
  className
}) {
  return <motion.div
    className={cn("flex justify-between px-4 py-3", className)}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 }}
  >
      {children}
    </motion.div>;
}
function FloatingPanelCloseButton({
  className
}) {
  const { closeFloatingPanel } = useFloatingPanel();
  return <motion.button
    type="button"
    className={cn("flex items-center", className)}
    onClick={closeFloatingPanel}
    aria-label="Close floating panel"
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.9 }}
  >
      <ArrowLeftIcon size={16} className="text-zinc-900 dark:text-zinc-100" />
    </motion.button>;
}
function FloatingPanelSubmitButton({
  className
}) {
  return <motion.button
    className={cn(
      "relative ml-1 flex h-8 shrink-0 scale-100 appearance-none items-center justify-center rounded-lg border border-zinc-950/10 bg-transparent px-2 text-sm text-zinc-500 transition-colors select-none hover:bg-zinc-100 hover:text-zinc-800 focus-visible:ring-2 active:scale-[0.98] dark:border-zinc-50/10 dark:text-zinc-50 dark:hover:bg-zinc-800",
      className
    )}
    type="submit"
    aria-label="Submit note"
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
  >
      Submit Note
    </motion.button>;
}
function FloatingPanelButton({
  children,
  onClick,
  className
}) {
  return <motion.button
    className={cn(
      "flex w-full items-center gap-2 rounded-md px-4 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700",
      className
    )}
    onClick={onClick}
    whileHover={{ backgroundColor: "rgba(0, 0, 0, 0.05)" }}
    whileTap={{ scale: 0.98 }}
  >
      {children}
    </motion.button>;
}
var floating_panel_default = {
  Root: FloatingPanelRoot,
  Trigger: FloatingPanelTrigger,
  Content: FloatingPanelContent,
  Form: FloatingPanelForm,
  Label: FloatingPanelLabel,
  Textarea: FloatingPanelTextarea,
  Header: FloatingPanelHeader,
  Body: FloatingPanelBody,
  Footer: FloatingPanelFooter,
  CloseButton: FloatingPanelCloseButton,
  SubmitButton: FloatingPanelSubmitButton,
  Button: FloatingPanelButton
};
export {
  FloatingPanelBody,
  FloatingPanelButton,
  FloatingPanelCloseButton,
  FloatingPanelContent,
  FloatingPanelFooter,
  FloatingPanelForm,
  FloatingPanelHeader,
  FloatingPanelLabel,
  FloatingPanelRoot,
  FloatingPanelSubmitButton,
  FloatingPanelTextarea,
  FloatingPanelTrigger,
  floating_panel_default as default
};
