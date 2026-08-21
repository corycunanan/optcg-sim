import * as React from "react"
import { cva } from "class-variance-authority"
import { NavigationMenu as NavigationMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { ChevronDownIcon } from "lucide-react"

function NavigationMenu({
  className,
  children,
  viewport = true,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean
}) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={cn(
        "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
      {viewport && <NavigationMenuViewport />}
    </NavigationMenuPrimitive.Root>
  )
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-0",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  )
}

const navigationMenuTriggerStyle = cva(
  "group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all hover:bg-muted focus:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-muted/50 data-[state=open]:hover:bg-muted data-[state=open]:focus:bg-muted"
)

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon className="relative top-px ml-1 size-3 transition duration-300 group-data-popup-open/navigation-menu-trigger:rotate-180 group-data-open/navigation-menu-trigger:rotate-180" aria-hidden="true" />
    </NavigationMenuPrimitive.Trigger>
  )
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        // Nav dropdowns paint no surface here (OPT-648): the material and the
        // chamfered perimeter come from the `NavbarDropdownSurface` each menu
        // renders inside its content, so this element only positions and
        // animates. The per-link focus suppressors that used to live on this
        // class (`focus:ring-0`, `focus:outline-none` on every descendant link)
        // are gone with them — they defeated the inset-outline focus idiom the
        // dropdown items now use.
        //
        // `pt-4` — NOT `mt-4` — supplies the visual gap below the navbar. These
        // menus open on hover: leaving the trigger starts Radix's 150ms close
        // timer, which only cancels once the pointer enters the content (or,
        // in viewport mode, the viewport). A margin would put dead space
        // between the two, so a pointer crossing it at ordinary speed hits the
        // timeout and the panel closes on the way to the rows. As padding the
        // gap is *inside* the content's own box, so the shell bridges it and
        // cancels the timer the moment the pointer leaves the trigger. In
        // viewport mode the height var is measured from this element's
        // offsetHeight, so the viewport box grows to cover the gap too.
        "top-0 left-0 w-full pt-4 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:duration-300 data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out md:absolute md:w-auto group-data-[viewport=false]/navigation-menu:data-[state=open]:animate-in group-data-[viewport=false]/navigation-menu:data-[state=open]:fade-in-0 group-data-[viewport=false]/navigation-menu:data-[state=open]:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-[state=closed]:animate-out group-data-[viewport=false]/navigation-menu:data-[state=closed]:fade-out-0 group-data-[viewport=false]/navigation-menu:data-[state=closed]:zoom-out-95",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div
      data-slot="navigation-menu-viewport-position"
      // OPT-680 removed the last viewport-mode menu in the app, and with it the
      // `.navbar-dropdown-viewport-position` CSS anchor rule this used to carry
      // (`position-anchor` / `left: anchor(left)`). Nothing declares
      // `anchor-name: --navbar-dropdown-trigger` any more, so the rule would
      // resolve against nothing; the viewport falls back to the primitive's own
      // centered placement.
      className={cn("absolute top-full isolate z-50 flex justify-center")}
    >
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          // Same split as the content (OPT-648): the viewport is a transparent
          // measuring/animating box — `overflow-hidden` clips the height
          // transition and nothing else — and the visible panel is the
          // `NavbarDropdownSurface` inside the content it hosts. No margin
          // here: the gap below the navbar is the content's `pt-4`, so this
          // box stays flush against the trigger row and bridges the pointer
          // across (see the note on `NavigationMenuContent`).
          "origin-top-center relative h-(--radix-navigation-menu-viewport-height) w-full overflow-hidden duration-100 md:w-(--radix-navigation-menu-viewport-width) data-[state=open]:animate-in data-[state=open]:zoom-in-90 data-[state=closed]:animate-out data-[state=closed]:zoom-out-90",
          className
        )}
        {...props}
      />
    </div>
  )
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        // Inside a dropdown the link is a dense row on a chamfered panel, so it
        // squares off (OPT-648, docs/design/SHAPE-LANGUAGE.md: ornament lives on
        // the panel's perimeter, never on the rows inside it). Outside one it is
        // a navbar trigger and keeps the shipped radius.
        "flex items-center gap-2 rounded-lg p-2 text-sm transition-all hover:bg-muted focus:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus in-data-[slot=navigation-menu-content]:rounded-none data-active:bg-muted/50 data-active:hover:bg-muted data-active:focus:bg-muted [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot="navigation-menu-indicator"
      className={cn(
        "top-full z-1 flex h-1.5 items-end justify-center overflow-hidden data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:animate-in data-[state=visible]:fade-in",
        className
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-md bg-border shadow-none" />
    </NavigationMenuPrimitive.Indicator>
  )
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
}
