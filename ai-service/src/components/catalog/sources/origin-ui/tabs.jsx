/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : origin-ui/tabs
 * Source    : github.com/origin-space/originui @ 890a79a5368b : apps/origin/registry/default/ui/tabs.tsx
 * License   : MIT, Copyright (c) 2025 coss.com; Originally Copyright (c) 2025 Origin UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "../../lib/utils.js";
function Tabs({
  className,
  ...props
}) {
  return <TabsPrimitive.Root
    className={cn("flex flex-col gap-2", className)}
    data-slot="tabs"
    {...props}
  />;
}
function TabsList({
  className,
  ...props
}) {
  return <TabsPrimitive.List
    className={cn(
      "inline-flex w-fit items-center justify-center rounded-md bg-muted p-0.5 text-muted-foreground/70",
      className
    )}
    data-slot="tabs-list"
    {...props}
  />;
}
function TabsTrigger({
  className,
  ...props
}) {
  return <TabsPrimitive.Trigger
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 font-medium text-sm outline-none transition-all hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs [&_svg]:shrink-0",
      className
    )}
    data-slot="tabs-trigger"
    {...props}
  />;
}
function TabsContent({
  className,
  ...props
}) {
  return <TabsPrimitive.Content
    className={cn("flex-1 outline-none", className)}
    data-slot="tabs-content"
    {...props}
  />;
}
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
};
