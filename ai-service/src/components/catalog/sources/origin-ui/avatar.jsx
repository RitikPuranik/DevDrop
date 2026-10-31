/*!
 * DevDrop component provenance (license notice - do not remove)
 * Component : origin-ui/avatar
 * Source    : github.com/origin-space/originui @ 890a79a5368b : apps/origin/registry/default/ui/avatar.tsx
 * License   : MIT, Copyright (c) 2025 coss.com; Originally Copyright (c) 2025 Origin UI
 * Full text : /THIRD_PARTY_NOTICES.md
 */
import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn } from "../../lib/utils.js";
function Avatar({
  className,
  ...props
}) {
  return <AvatarPrimitive.Root
    className={cn(
      "relative flex size-8 shrink-0 overflow-hidden rounded-full",
      className
    )}
    data-slot="avatar"
    {...props}
  />;
}
function AvatarImage({
  className,
  ...props
}) {
  return <AvatarPrimitive.Image
    className={cn("aspect-square size-full", className)}
    data-slot="avatar-image"
    {...props}
  />;
}
function AvatarFallback({
  className,
  ...props
}) {
  return <AvatarPrimitive.Fallback
    className={cn(
      "flex size-full items-center justify-center rounded-[inherit] bg-secondary text-xs",
      className
    )}
    data-slot="avatar-fallback"
    {...props}
  />;
}
export {
  Avatar,
  AvatarFallback,
  AvatarImage
};
