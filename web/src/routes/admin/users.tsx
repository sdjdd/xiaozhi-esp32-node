import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { createFileRoute } from '@tanstack/react-router';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import { adminApi } from '@/api/admin';
import type { AdminUser } from '@/api/admin';
import { userApi } from '@/api/user';
import { PageGlow } from '@/components/ambient';
import { DataTable, DataTableSortHeader } from '@/components/data-table';
import type { DataTableFeatures } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { AdminPageHeader } from './route';

const PAGE_SIZE = 10;

export const Route = createFileRoute('/admin/users')({
  component: AdminUsers,
});

const columnHelper = createColumnHelper<DataTableFeatures, AdminUser>();

/** 排序走 API（服务端按 id 排序），列头只给注册时间放排序按钮 */
function getUsersColumns(selfId: number | undefined) {
  return columnHelper.columns([
    columnHelper.accessor('username', {
      header: '用户名',
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.username}
          {row.original.id === selfId ? (
            <span className="text-muted-foreground text-xs">（我）</span>
          ) : null}
        </span>
      ),
    }),
    columnHelper.accessor('role', {
      header: '角色',
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    }),
    columnHelper.accessor('deviceCount', {
      header: () => <div className="text-center">设备</div>,
      cell: ({ getValue }) => (
        <div className="text-center tabular-nums">{getValue() || '–'}</div>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: ({ column }) => (
        <DataTableSortHeader column={column} title="注册时间" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.createdAt
            ? format(row.original.createdAt, 'yyyy-MM-dd HH:mm:ss')
            : '–'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => <UserActions user={row.original} selfId={selfId} />,
    }),
  ]);
}

function AdminUsers() {
  const me = useQuery({ queryKey: ['me'], queryFn: userApi.me });

  // 服务端分页 + 排序（仅注册时间，asc/desc）：搜索输入 300ms 防抖后回第 1 页
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 表头排序状态映射为 API 的 order 参数（空 = 未排序，视作正序）
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: false },
  ]);
  const order: 'asc' | 'desc' = sorting[0]?.desc ? 'desc' : 'asc';
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((prev) =>
      typeof updater === 'function' ? updater(prev) : updater,
    );
    setPage(1);
  };

  const users = useQuery({
    queryKey: ['admin', 'users', page, order, q],
    queryFn: () => adminApi.users({ page, pageSize: PAGE_SIZE, order, q }),
    placeholderData: keepPreviousData,
  });

  // selfId 变化（如刷新后 me 才到）需要重建列定义，让「（我）」标记跟上
  const columns = getUsersColumns(me.data?.uid);
  const total = users.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 py-10">
      <PageGlow />
      <AdminPageHeader
        title="用户管理"
        description="调整账号角色；改角色即时生效，被改用户的下一次请求即为新权限。"
      />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索用户名…"
            className="h-9 pl-9"
          />
        </div>
        <span className="text-muted-foreground text-sm">共 {total} 个账号</span>
      </div>

      {users.isError ? (
        <p className="mt-4 py-28 text-center text-muted-foreground">
          用户列表加载失败，请刷新重试
        </p>
      ) : users.isPending ? (
        <Loader2 className="mx-auto mt-16 block size-6 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div
            className={
              users.isPlaceholderData
                ? 'mt-4 opacity-60 transition-opacity'
                : 'mt-4 transition-opacity'
            }
          >
            <DataTable
              columns={columns}
              data={users.data.items}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              empty="没有匹配的账号"
            />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-muted-foreground text-sm tabular-nums">
              第 {page} / {pageCount} 页
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="上一页"
                disabled={page <= 1 || users.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="下一页"
                disabled={page >= pageCount || users.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 行操作：调整角色（改自己会造成管理权自锁，禁用） */
function UserActions({
  user,
  selfId,
}: {
  user: AdminUser;
  selfId: number | undefined;
}) {
  const queryClient = useQueryClient();
  const setRole = useMutation({
    mutationFn: (role: 'user' | 'admin') => adminApi.setRole(user.id, role),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  if (user.id === selfId) {
    return (
      <div className="text-right text-muted-foreground text-xs">不可自改</div>
    );
  }

  const promote = user.role === 'user';
  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={setRole.isPending}
          render={
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            />
          }
        >
          {setRole.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ChevronDown />
          )}
          调整
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant={promote ? 'default' : 'destructive'}
            onClick={() => setRole.mutate(promote ? 'admin' : 'user')}
          >
            {promote ? <ShieldCheck /> : <User />}
            {promote ? '升为管理员' : '降为普通用户'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  if (role === 'admin') {
    return (
      <Badge className="bg-primary/10 text-primary" variant="secondary">
        <ShieldCheck className="size-3" />
        管理员
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      <User className="size-3" />
      普通用户
    </Badge>
  );
}
