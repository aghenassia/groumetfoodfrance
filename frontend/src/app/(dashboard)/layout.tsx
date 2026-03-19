"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api, User } from "@/lib/api";
import {
  LayoutDashboard,
  ListMusic,
  Users,
  Phone,
  Trophy,
  Shield,
  LogOut,
  Menu,
  Package,
  ShoppingCart,
  UserCog,
  BookOpen,
  BarChart3,
  ContactRound,
  Calculator,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { AuthProvider } from "@/lib/auth-context";
import { CallCompanionProvider } from "@/components/call-companion/context";
import { CallCompanionWidget } from "@/components/call-companion/widget";
import { ReminderNotifier } from "@/components/reminder-notifier";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/playlist", label: "To do", icon: ListMusic },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/calls", label: "Appels", icon: Phone },
  { href: "/products", label: "Produits", icon: Package },
  { href: "/orders", label: "Commandes", icon: ShoppingCart },
  { href: "/leaderboard", label: "Classement", icon: Trophy },
  { href: "/analytics", label: "Analytics", icon: PieChart },
  { href: "/wiki", label: "Wiki", icon: BookOpen },
];

const ADMIN_ITEMS = [
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "/admin/users", label: "Utilisateurs", icon: UserCog },
  { href: "/admin/playlists", label: "To do Admin", icon: ListMusic },
  { href: "/admin/sales-dashboard", label: "Pilotage Sales", icon: BarChart3 },
  { href: "/admin/assignments", label: "Assignation Clients", icon: Users },
  { href: "/admin/margins", label: "Règles de marge", icon: Calculator },
  { href: "/admin/challenges", label: "Challenges", icon: Trophy },
  { href: "/admin/import", label: "Import leads", icon: Upload },
  { href: "/admin/glossaire", label: "Glossaire", icon: BookOpen },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  if (!user) return null;

  const handleLogout = () => {
    api.logout();
    router.push("/login");
  };

  const navItems =
    user.role === "admin" ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS;

  const SidebarContent = ({ showCollapse = false }: { showCollapse?: boolean }) => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <img src="/gff-white.svg" alt="GFF" className="h-7 w-auto" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-kiku">GFF CRM</h1>
            <p className="text-xs text-sidebar-foreground/60">Gourmet Food France</p>
          </div>
          {showCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => setSidebarCollapsed(true)}
              title="Masquer le menu"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="h-px bg-sidebar-border" />
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="h-px bg-sidebar-border" />
      <div className="p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-8 w-8 bg-sidebar-accent">
            <AvatarFallback className="text-xs bg-sidebar-accent text-kiku font-bold">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">
              {user.role}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <AuthProvider>
      <CallCompanionProvider>
        <div className="h-screen flex overflow-hidden bg-background">
          {/* Desktop sidebar */}
          <aside
            className={`hidden md:flex flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0 overflow-y-auto overflow-x-hidden scrollbar-thin transition-all duration-300 ease-in-out ${
              sidebarCollapsed ? "w-0 border-r-0" : "w-56"
            }`}
          >
            <div className={`w-56 min-w-[14rem] ${sidebarCollapsed ? "opacity-0" : "opacity-100"} transition-opacity duration-200`}>
              <SidebarContent showCollapse />
            </div>
          </aside>

          {/* Mobile sidebar */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-56 p-0 bg-sidebar border-sidebar-border">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent />
            </SheetContent>
          </Sheet>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Mobile header (always) */}
            <header className="md:hidden flex items-center gap-3 border-b px-4 h-14 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <h1 className="text-sm font-semibold">GFF CRM</h1>
            </header>
            {/* Desktop: expand button when sidebar is collapsed */}
            {sidebarCollapsed && (
              <div className="hidden md:flex items-center h-10 px-3 border-b shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setSidebarCollapsed(false)}
                  title="Afficher le menu"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </Button>
              </div>
            )}
            <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
          </div>
        </div>
        <CallCompanionWidget />
        <ReminderNotifier />
      </CallCompanionProvider>
    </AuthProvider>
  );
}
