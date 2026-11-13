import { NotificationBell } from "@/components/notifications/notification-bell";
import { BrandLogo } from "./brand-logo";
import { MobileSidebarToggle } from "./mobile-sidebar-toggle";
import "./workspace.css";

export function WorkspaceShell({
  sidebar,
  userId,
  children,
}: {
  sidebar: React.ReactNode;
  userId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="workspace-shell flex h-dvh overflow-hidden">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="workspace-topbar">
          <div className="flex items-center gap-3 md:hidden">
            <MobileSidebarToggle />
            <BrandLogo className="font-semibold text-primary [&_svg]:size-6" />
          </div>
          <div className="ml-auto">
            <NotificationBell userId={userId} />
          </div>
        </header>
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
