"use client";

import * as React from "react";
import {
  IconCamera,
  IconChartBar,
  IconDashboard,
  IconDatabase,
  IconFileAi,
  IconFileDescription,
  IconFileWord,
  IconFolder,
  IconHelp,
  IconInnerShadowTop,
  IconListDetails,
  IconReport,
  IconSearch,
  IconSettings,
  IconPhoneFilled,
  IconUsers,
  IconTool
} from "@tabler/icons-react";

import { NavDocuments } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { motion } from "framer-motion";
import Link from "next/link"; // Import Next.js Link

const letters = "Callify".split("");
const data = {
  user: {
    name: "callify",
    email: "callify@gmail.com",
    avatar: "/avatars/shadcn.jpg",
  },
 navMain: [
    {
      title: "Dashboard",
      url: "/", // Home page
      icon: IconDashboard,
    },
    {
      title: "Agent Create",
      url: "/agent-list", // Assuming you have a page for creating agents at this path
      icon: IconFileAi, // Assuming this icon represents creation or AI agents
    },
    {
      title: "History",
      url: "/call-history", // Assuming you have a history page at this path
      icon: IconChartBar, // Assuming this icon represents analytics or history
    },
    {
      title: "Phone Number",
      url: "/phone-numbers", // Home page
      icon: IconPhoneFilled,
    },
     {
      title: "Batch Calling",
      url: "/batch-calling", // Home page
      icon: IconUsers,
    },
     {
      title: "MCP",
      url: "/mcp", // Home page
      icon: IconTool,
    },
  ],
  navClouds: [
    {
      title: "Capture",
      icon: IconCamera,
      isActive: true,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Proposal",
      icon: IconFileDescription,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Prompts",
      icon: IconFileAi,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: IconSettings,
    },
    {
      title: "Get Help",
      url: "#",
      icon: IconHelp,
    },
    {
      title: "Search",
      url: "#",
      icon: IconSearch,
    },
  ],

};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/">

                  <IconInnerShadowTop className="!size-5" />
                  <span className="text-base font-semibold flex">
                    {letters.map((l, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0, y: 2 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: i * 0.08,
                          duration: 0.3,
                          ease: "easeOut",
                        }}
                      >
                        {l}
                      </motion.span>
                    ))}
                  </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}