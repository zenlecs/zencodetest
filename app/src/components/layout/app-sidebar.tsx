import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Wallet,
  FileText,
  MessageSquare,
  Calculator,
  Settings,
  HelpCircle,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";

const mainNavItems = [
  { title: "Dashboard", url: "/os", icon: LayoutDashboard },
  { title: "E-Wallet", url: "/os/wallet", icon: Wallet },
  { title: "Belgeler", url: "/os/documents", icon: FileText },
  { title: "İletişim", url: "/os/communications", icon: MessageSquare },
  { title: "Muhasebe", url: "/os/accounting", icon: Calculator },
];

const footerNavItems = [
  { title: "Ayarlar", url: "/os/settings", icon: Settings },
  { title: "Yardım", url: "/os/help", icon: HelpCircle },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();

  const handleNavigation = (url: string) => {
    setLocation(url);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-2 px-1">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base tracking-tight group-data-[collapsible=icon]:hidden">
            ZenOS
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem 
                    key={item.title}
                  >
                    <SidebarMenuButton
                      isActive={isActive}
                      className="gap-3"
                      onClick={() => handleNavigation(item.url)}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                      tooltip={item.title}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {footerNavItems.map((item) => {
            const isActive = location === item.url;
            return (
              <SidebarMenuItem 
                key={item.title}
              >
                <SidebarMenuButton
                  isActive={isActive}
                  className="gap-3"
                  onClick={() => handleNavigation(item.url)}
                  data-testid={`nav-${item.title.toLowerCase()}`}
                  tooltip={item.title}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
