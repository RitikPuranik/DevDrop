/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : origin-ui/progress
 * Source    : github.com/origin-space/originui @ 890a79a5368b : apps/origin/registry/default/ui/progress.tsx
 * License   : MIT, Copyright (c) 2025 coss.com; Originally Copyright (c) 2025 Origin UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "../../lib/utils.js";
function Progress({
  className,
  value,
  ...props
}) {
  return <ProgressPrimitive.Root
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
      className
    )}
    data-slot="progress"
    {...props}
  >
      <ProgressPrimitive.Indicator
    className="size-full flex-1 bg-primary transition-all"
    data-slot="progress-indicator"
    style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
  />
    </ProgressPrimitive.Root>;
}
export {
  Progress
};
