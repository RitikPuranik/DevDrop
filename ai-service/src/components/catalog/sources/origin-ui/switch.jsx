/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : origin-ui/switch
 * Source    : github.com/origin-space/originui @ 890a79a5368b : apps/origin/registry/default/ui/switch.tsx
 * License   : MIT, Copyright (c) 2025 coss.com; Originally Copyright (c) 2025 Origin UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "../../lib/utils.js";
function Switch({
  className,
  ...props
}) {
  return <SwitchPrimitive.Root
    className={cn(
      "peer inline-flex h-6 w-10 shrink-0 items-center rounded-full border-2 border-transparent outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    data-slot="switch"
    {...props}
  >
      <SwitchPrimitive.Thumb
    className={cn(
      "pointer-events-none block size-5 rounded-full bg-background shadow-xs ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 data-[state=checked]:rtl:-translate-x-4"
    )}
    data-slot="switch-thumb"
  />
    </SwitchPrimitive.Root>;
}
export {
  Switch
};
