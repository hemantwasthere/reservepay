import {
  ChartNoAxesCombined,
  Link2,
  ShieldCheck,
  CircleHelp,
  ArrowUpRight,
  PanelLeftClose,
  PanelLeftOpen,
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
export type WorkspacePage = "overview" | "payments";
export function WorkspaceSidebar({ page }: { page: WorkspacePage }) {
  const { setOpenMobile, isMobile } = useSidebar();
  return (
    <Sidebar
      collapsible="icon"
      className={"top-[88px] h-[calc(100svh-88px)] border-line"}
      aria-label="Workspace navigation"
    >
      <SidebarContent
        className={"gap-6 px-3 pt-7 group-data-[collapsible=icon]:px-2"}
      >
        {isMobile && (
          <div className={"flex items-center justify-between px-2"}>
            <span className={"text-sm font-medium"}>Your workspace</span>
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
        <SidebarGroup className={"p-0"}>
          <SidebarGroupLabel
            className={
              "mb-4 px-3 font-mono text-[9px] tracking-[1.2px] text-muted-foreground"
            }
          >
            YOUR WORKSPACE
          </SidebarGroupLabel>
          <SidebarMenu className={"gap-2"}>
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
                  className={
                    "h-11 gap-3 rounded border border-transparent px-3 text-[13px] text-muted-foreground transition-colors hover:bg-accent data-[active=true]:border-[#d9e1ce] data-[active=true]:bg-[#e8eddf] data-[active=true]:text-primary group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10!"
                  }
                >
                  <a
                    href={item.href}
                    aria-label={item.label}
                    aria-current={page === item.page ? "page" : undefined}
                    onClick={() => setOpenMobile(false)}
                  >
                    <item.icon className={"size-[17px]"} />
                    <span className="group-data-[collapsible=icon]:sr-only">
                      {item.label}
                    </span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter
        className={"gap-6 px-6 pb-8 group-data-[collapsible=icon]:px-2"}
      >
        <div className={"group-data-[collapsible=icon]:hidden"}>
          <ShieldCheck className={"mb-4 size-[22px] text-[#779469]"} />
          <strong className={"text-[15px] font-medium leading-relaxed"}>
            A little reserve.
            <br />A lot of trust.
          </strong>
          <p
            className={"mt-3 text-[11px] leading-relaxed text-muted-foreground"}
          >
            Collateral stays in your on-chain reserve, ready to protect your
            customers.
          </p>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="How ReservePay works"
              className={
                "h-auto min-h-9 gap-2 p-0 text-[10px] text-muted-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10!"
              }
            >
              <a href="/#faq-title" aria-label="How ReservePay works">
                <CircleHelp className={"size-4"} />
                <span className="group-data-[collapsible=icon]:sr-only">
                  How ReservePay works
                </span>
                <ArrowUpRight
                  className={"size-3 group-data-[collapsible=icon]:hidden"}
                />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
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
  const Icon = isMobile
    ? Menu
    : state === "expanded"
      ? PanelLeftClose
      : PanelLeftOpen;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      aria-label={label}
      title={`${label} (Alt+Shift+B)`}
      aria-expanded={isMobile ? openMobile : state === "expanded"}
      aria-keyshortcuts="Alt+Shift+B"
      className={"size-8 shrink-0 text-muted-foreground"}
    >
      <Icon className={"size-[17px]"} />
    </Button>
  );
}
