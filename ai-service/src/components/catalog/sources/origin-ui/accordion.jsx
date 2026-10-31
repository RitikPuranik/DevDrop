/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : origin-ui/accordion
 * Source    : github.com/origin-space/originui @ 890a79a5368b : apps/origin/registry/default/ui/accordion.tsx
 * License   : MIT, Copyright (c) 2025 coss.com; Originally Copyright (c) 2025 Origin UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { ChevronDownIcon } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { cn } from "../../lib/utils.js";
function Accordion({
  ...props
}) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}
function AccordionItem({
  className,
  ...props
}) {
  return <AccordionPrimitive.Item
    className={cn("border-b last:border-b-0", className)}
    data-slot="accordion-item"
    {...props}
  />;
}
function AccordionTrigger({
  className,
  children,
  ...props
}) {
  return <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
    className={cn(
      "flex flex-1 items-center justify-between gap-4 rounded-md py-4 text-left font-semibold text-sm outline-none transition-all hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
      className
    )}
    data-slot="accordion-trigger"
    {...props}
  >
        {children}
        <ChevronDownIcon
    aria-hidden="true"
    className="pointer-events-none shrink-0 opacity-60 transition-transform duration-200"
    size={16}
  />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>;
}
function AccordionContent({
  className,
  children,
  ...props
}) {
  return <AccordionPrimitive.Content
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    data-slot="accordion-content"
    {...props}
  >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>;
}
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
};
