"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Video,
  Camera,
  Bell,
  Search,
  CalendarClock,
  BarChart3,
  Settings,
  Cpu,
  Radio,
  Wifi,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Live View", href: "/live", icon: Video },
  { title: "Cameras", href: "/cameras", icon: Camera },
  { title: "Alerts", href: "/alerts", icon: Bell },
  { title: "Search", href: "/search", icon: Search },
  { title: "Events", href: "/events", icon: CalendarClock },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
  { title: "Settings", href: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-4">
        <Link
          href="/"
          className="flex flex-col items-start group-data-[collapsible=icon]:items-center"
        >
          {/* Logo */}
          <span
            className="font-heading text-xl font-bold text-[#00f0ff] text-glow leading-none group-data-[collapsible=icon]:text-base"
          >
            SC
          </span>
          <span className="font-heading text-[10px] tracking-[0.15em] text-[#00f0ff]/70 mt-1 group-data-[collapsible=icon]:hidden">
            SAFE CITY
          </span>
          {/* Animated border-flow line */}
          <div
            className="mt-2 h-[2px] w-full group-data-[collapsible=icon]:hidden"
            style={{
              background: "linear-gradient(90deg, transparent, #00f0ff, transparent)",
              backgroundSize: "200% 100%",
              animation: "borderFlow 3s linear infinite",
            }}
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-heading text-[9px] tracking-[0.15em] text-[#4a6a8a] px-4">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.title}
                      render={<Link href={item.href} />}
                      className={
                        isActive
                          ? "border-l-2 border-[#00f0ff] bg-[rgba(0,240,255,0.1)] text-[#00f0ff] glow-cyan font-medium"
                          : "text-[#a0c0e0] hover:bg-[rgba(0,240,255,0.05)] hover:text-[#00f0ff] transition-colors"
                      }
                    >
                      <item.icon
                        className={`size-4 ${isActive ? "text-[#00f0ff]" : ""}`}
                      />
                      <span className="font-body text-sm">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator style={{ backgroundColor: "rgba(0, 240, 255, 0.08)" }} />

      <SidebarFooter className="px-4 py-3">
        <div className="space-y-2.5 group-data-[collapsible=icon]:hidden">
          <p className="font-heading text-[9px] tracking-[0.15em] text-[#4a6a8a]">
            SYSTEM STATUS
          </p>
          <div className="space-y-1.5">
            {/* GPU */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-[#4a6a8a]">
                <Cpu className="size-3" />
                <span className="font-body">GPU</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-data text-[#a0c0e0]">B200</span>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff88] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00ff88]" />
                </span>
              </span>
            </div>
            {/* AI Service */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-[#4a6a8a]">
                <Cpu className="size-3" />
                <span className="font-body">AI SERVICE</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff88] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00ff88]" />
                </span>
              </span>
            </div>
            {/* Cameras */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-[#4a6a8a]">
                <Radio className="size-3" />
                <span className="font-body">CAMERAS</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-data text-[#a0c0e0]">12/16</span>
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#ffaa00]" />
              </span>
            </div>
            {/* Network */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-[#4a6a8a]">
                <Wifi className="size-3" />
                <span className="font-body">NETWORK</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff88] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00ff88]" />
                </span>
              </span>
            </div>
          </div>
          {/* Version */}
          <p className="font-data text-[9px] text-[#4a6a8a]/60 pt-1">
            v1.0.0-alpha
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
