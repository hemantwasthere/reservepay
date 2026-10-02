import {
  ChartNoAxesCombined,
  Link2,
  ShieldCheck,
  CircleHelp,
  ArrowUpRight,
  Menu,
  X,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type WorkspacePage = "overview" | "payments";

// Keep labels at their expanded width so they fade without wrapping as the rail narrows.
const labelClasses =
  "shrink-0 whitespace-nowrap transition-[opacity,transform] duration-150 ease-out group-data-[collapsible=icon]:-translate-x-2 group-data-[collapsible=icon]:opacity-0";
const menuClasses =
  "h-10 gap-3 rounded border border-transparent p-[11px] text-muted-foreground transition-[width,background-color,color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-accent group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:p-[11px]";

export function WorkspaceSidebar({ page }: { page: WorkspacePage }) {
  const { setOpenMobile, isMobile, state } = useSidebar();
  return (
    <Sidebar
      collapsible="icon"
      className="top-[88px] h-[calc(100svh-88px)] border-line"
      aria-label="Workspace navigation"
    >
      <SidebarContent className="gap-6 overflow-x-hidden px-3 pt-7 transition-[padding] duration-300 group-data-[collapsible=icon]:px-[11px]">
        {isMobile && (
          <div className="flex items-center justify-between px-2">
            <span className="text-sm font-medium">Your workspace</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close navigation"
              onClick={() => setOpenMobile(false)}
            >
              <X />
            </Button>
          </div>
        )}
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="mb-4 whitespace-nowrap px-3 font-mono text-[9px] tracking-[1.2px] text-muted-foreground group-data-[collapsible=icon]:mt-0">
            YOUR WORKSPACE
          </SidebarGroupLabel>
          <SidebarMenu className="gap-2">
            {[
              {
                page: "overview",
                href: "/app",
                label: "Overview",
                icon: ChartNoAxesCombined,
              },
              {
                page: "payments",
                href: "/app/payments",
                label: "Payment links",
                icon: Link2,
              },
            ].map((item) => (
              <SidebarMenuItem key={item.page}>
                <SidebarMenuButton
                  asChild
                  isActive={page === item.page}
                  tooltip={item.label}
                  className={`${menuClasses} text-[13px] data-[active=true]:border-[#d9e1ce] data-[active=true]:bg-[#e8eddf] data-[active=true]:text-primary`}
                >
                  <a
                    href={item.href}
                    aria-label={item.label}
                    aria-current={page === item.page ? "page" : undefined}
                    onClick={() => setOpenMobile(false)}
                  >
                    <item.icon className="size-4" aria-hidden="true" />
                    <span className={labelClasses} aria-hidden="true">
                      {item.label}
                    </span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-6 overflow-hidden px-3 pb-8 transition-[padding] duration-300 group-data-[collapsible=icon]:px-[11px]">
        <div
          className="max-h-60 overflow-hidden opacity-100 transition-[max-height,opacity] duration-300 ease-out group-data-[collapsible=icon]:max-h-0 group-data-[collapsible=icon]:opacity-0"
          aria-hidden={!isMobile && state === "collapsed"}
        >
          <div className="w-[212px] px-3">
            <ShieldCheck className="mb-4 size-[22px] text-[#779469]" />
            <strong className="text-[15px] font-medium leading-relaxed">
              A little reserve.
              <br />A lot of trust.
            </strong>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Collateral stays in your on-chain reserve, ready to protect your
              customers.
            </p>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="How ReservePay works"
              className={`${menuClasses} text-[10px]`}
            >
              <a href="/#faq-title" aria-label="How ReservePay works">
                <CircleHelp className="size-4" aria-hidden="true" />
                <span
                  className={`${labelClasses} flex items-center gap-2`}
                  aria-hidden="true"
                >
                  How ReservePay works <ArrowUpRight className="size-3" />
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarGlyph({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <path d={collapsed ? "M9 8v8" : "M9 4v16"} />
    </svg>
  );
}

export function WorkspaceSidebarTrigger() {
  const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
  const label = isMobile
    ? openMobile
      ? "Close navigation"
      : "Open navigation"
    : state === "expanded"
      ? "Collapse sidebar"
      : "Expand sidebar";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={label}
          aria-expanded={isMobile ? openMobile : state === "expanded"}
          aria-keyshortcuts="Alt+Shift+B"
          className="size-9 shrink-0 rounded-md text-muted-foreground"
        >
          {isMobile ? (
            <Menu className="size-[18px]" />
          ) : (
            <SidebarGlyph collapsed={state === "collapsed"} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
        <span className="ml-2 opacity-70">Alt Shift B</span>
      </TooltipContent>
    </Tooltip>
  );
}
