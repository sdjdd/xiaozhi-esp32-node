import { useEffect, useState } from 'react';
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useNavigate,
} from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AudioLines,
  ChevronLeft,
  Drama,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Users,
} from 'lucide-react';
import { TOKEN_KEY } from '@/api/client';
import { userApi } from '@/api/user';
import { BrandMark } from '@/components/ambient';
import { ChangePasswordDialog } from '@/components/change-password-dialog';
import { use401Redirect } from '@/hooks/use-401-redirect';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

/** 导航即路由：/admin 域的功能模块 */
const NAV_ITEMS = [
  { to: '/admin', title: '数据总览', icon: LayoutDashboard },
  { to: '/admin/users', title: '用户管理', icon: Users },
  { to: '/admin/personas', title: '预设角色', icon: Drama },
  { to: '/admin/voices', title: '音色管理', icon: AudioLines },
] as const;

/**
 * 管理后台 layout：侧边栏区分功能模块，子路由经 Outlet 挂载。
 * 双层守卫——beforeLoad 挡无凭证，组件内校验角色（/me 的 role 非 admin
 * 弹回设备页；改角色即时生效，前端不做缓存判断）
 */
export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    if (localStorage.getItem(TOKEN_KEY) === null) {
      throw redirect({ to: '/login' });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ['me'], queryFn: userApi.me });
  use401Redirect(me.error);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    if (me.data && me.data.role !== 'admin') {
      void navigate({ to: '/devices' });
    }
  }, [me.data, navigate]);

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    void navigate({ to: '/login' });
  }

  if (me.isPending || !me.data || me.data.role !== 'admin') {
    // 角色校验完成前不渲染任何后台内容，避免越权闪现
    return (
      <div className="grid min-h-svh place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="返回控制台"
                render={<Link to="/devices" />}
              >
                <BrandMark className="size-8 shrink-0" />
                <div className="grid leading-tight">
                  <span className="truncate font-semibold">管理后台</span>
                  <span className="text-muted-foreground text-xs">
                    {me.data.username}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarNav />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="返回控制台"
                render={<Link to="/devices" />}
              >
                <ChevronLeft />
                <span>返回控制台</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="修改密码"
                onClick={() => setPasswordOpen(true)}
              >
                <KeyRound />
                <span>修改密码</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="退出登录" onClick={logout}>
                <LogOut />
                <span>退出登录</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1! h-4! my-auto" />
          <span className="font-semibold">管理后台</span>
        </header>
        <Outlet />
      </SidebarInset>
      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </SidebarProvider>
  );
}

/** 导航项激活态：总览精确匹配，其余按前缀匹配（同前缀子页保持激活） */
function SidebarNav() {
  const { pathname } = useLocation();

  return (
    <SidebarMenu>
      {NAV_ITEMS.map((item) => {
        const active =
          item.to === '/admin'
            ? pathname === '/admin' || pathname === '/admin/'
            : pathname.startsWith(item.to);
        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              isActive={active}
              tooltip={item.title}
              render={<Link to={item.to} />}
            >
              <item.icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/** 后台页通用页头：标题 + 副标题 + 右侧动作区 */
export function AdminPageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
