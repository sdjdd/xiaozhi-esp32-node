import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  AudioLines,
  Bot,
  Drama,
  Loader2,
  MessageSquareText,
  Users,
  Wifi,
} from 'lucide-react';
import { adminApi } from '@/api/admin';
import type { AdminStats } from '@/api/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageGlow } from '@/components/ambient';
import { AdminPageHeader } from './route';

/** 总览卡片配置：数值驱动的只读统计 */
const CARDS: {
  key: keyof AdminStats;
  label: string;
  icon: typeof Users;
  hint: string;
}[] = [
  { key: 'users', label: '用户', icon: Users, hint: '注册账号总数' },
  { key: 'devices', label: '设备', icon: Bot, hint: '含未激活设备' },
  { key: 'onlineDevices', label: '在线设备', icon: Wifi, hint: '当前实时连接' },
  {
    key: 'messages',
    label: '对话消息',
    icon: MessageSquareText,
    hint: '历史累计',
  },
  { key: 'personas', label: '预设角色', icon: Drama, hint: '内置性格清单' },
  { key: 'voices', label: '音色', icon: AudioLines, hint: 'TTS 候选清单' },
];

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
});

function AdminDashboard() {
  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: adminApi.stats,
  });

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 py-10">
      <PageGlow />
      <AdminPageHeader
        title="数据总览"
        description="全站规模的只读速览；在线设备随连接实时变化。"
      />

      {stats.isPending ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <Skeleton key={c.key} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : stats.isError ? (
        <p className="py-28 text-center text-muted-foreground">
          统计加载失败，请刷新重试
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <Card key={c.key} className="gap-0 rounded-2xl py-6">
              <CardContent className="flex items-center gap-4 px-6">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <c.icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums tracking-tight">
                      {stats.data[c.key]}
                    </span>
                    <span className="font-medium">{c.label}</span>
                  </div>
                  <p className="text-muted-foreground text-sm">{c.hint}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {stats.isFetching && !stats.isPending ? (
        <Loader2 className="mx-auto mt-6 size-4 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
