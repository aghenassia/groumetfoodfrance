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
  UserCog,
  BookOpen,
  BarChart3,
  ContactRound,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/playlist", label: "Playlist", icon: ListMusic },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/contacts", label: "Contacts", icon: ContactRound },
  { href: "/calls", label: "Appels", icon: Phone },
  { href: "/products", label: "Produits", icon: Package },
  { href: "/leaderboard", label: "Classement", icon: Trophy },
  { href: "/wiki", label: "Wiki", icon: BookOpen },
];

const ADMIN_ITEMS = [
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "/admin/users", label: "Utilisateurs", icon: UserCog },
  { href: "/admin/playlists", label: "Playlists Admin", icon: ListMusic },
  { href: "/admin/sales-dashboard", label: "Pilotage Sales", icon: BarChart3 },
  { href: "/admin/assignments", label: "Assignation Clients", icon: Users },
  { href: "/admin/margins", label: "Règles de marge", icon: Calculator },
  { href: "/admin/challenges", label: "Challenges", icon: Trophy },
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

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="p-4">
        <h1 className="text-lg font-bold tracking-tight text-kiku">Sales Machine</h1>
        <p className="text-xs text-sidebar-foreground/60">CRM Phone-First</p>
      </div>
      <div className="h-px bg-sidebar-border" />
      <nav className="flex-1 p-2 space-y-0.5">
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
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-sidebar-border bg-sidebar">
        <SidebarContent />
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
        <header className="md:hidden flex items-center gap-3 border-b px-4 h-14">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <h1 className="text-sm font-semibold">Sales Machine</h1>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
