/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : origin-ui/tooltip
 * Source    : github.com/origin-space/originui @ 890a79a5368b : apps/origin/registry/default/ui/tooltip.tsx
 * License   : MIT, Copyright (c) 2025 coss.com; Originally Copyright (c) 2025 Origin UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "../../lib/utils.js";
function TooltipProvider({
  delayDuration = 0,
  ...props
}) {
  return <TooltipPrimitive.Provider
    data-slot="tooltip-provider"
    delayDuration={delayDuration}
    {...props}
  />;
}
function Tooltip({
  ...props
}) {
  return <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>;
}
function TooltipTrigger({
  ...props
}) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}
function TooltipContent({
  className,
  sideOffset = 4,
  showArrow = false,
  children,
  ...props
}) {
  return <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
    className={cn(
      "fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 relative z-50 max-w-70 animate-in rounded-md border bg-popover px-3 py-1.5 text-popover-foreground text-sm data-[state=closed]:animate-out",
      className
    )}
    data-slot="tooltip-content"
    sideOffset={sideOffset}
    {...props}
  >
        {children}
        {showArrow && <TooltipPrimitive.Arrow className="-my-px fill-popover drop-shadow-[0_1px_0_var(--border)]" />}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>;
}
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
};
