import { useState } from 'react';
import {
  KeyRound,
  LogOut,
  Plus,
  ShieldCheck,
  SquarePen,
  Trash2,
  UserRound,
} from 'lucide-react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { TOKEN_KEY } from '@/api/client';
import { deviceApi } from '@/api/device';
import type { DeviceInfo } from '@/api/device';
import { errorText, isUnauthorized } from '@/api/errors';
import { userApi } from '@/api/user';
import { BrandMark, PageGlow, VoiceBars } from '@/components/ambient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { InputOTP, InputOTPSlot } from '@/components/ui/input-otp';
import { Input } from '@/components/ui/input';
import { CompanionSettings } from '@/components/companion-settings';
import { ChangePasswordDialog } from '@/components/change-password-dialog';
import { use401Redirect } from '@/hooks/use-401-redirect';

export const Route = createFileRoute('/devices/')({
  component: DevicesPage,
});

function DevicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: ['devices'], queryFn: deviceApi.list });
  const me = useQuery({ queryKey: ['me'], queryFn: userApi.me });
  // token 过期/无效时回登录页（/me 与设备列表任一报 401）
  use401Redirect(me.error);
  use401Redirect(devices.error);
  // 添加设备弹窗用 detached trigger（handle 关联）——若整页包进 Dialog 根，
  // 卡片内的编辑/解绑弹窗会沦为嵌套弹窗，遮罩挂进父弹窗内部而失效
  const [addHandle] = useState(() => DialogPrimitive.createHandle());
  const [passwordOpen, setPasswordOpen] = useState(false);

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    // 清掉本机缓存（me 等），避免换账号登录时闪现上一个用户的数据
    queryClient.clear();
    void navigate({ to: '/login' });
  }

  return (
    <div className="min-h-svh">
      <PageGlow />
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="size-9" />
            <span className="font-semibold text-lg">语音助手控制台</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="用户菜单" />
              }
            >
              <UserRound />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-lg">
                      {me.data?.username.charAt(0) ?? '…'}
                    </AvatarFallback>
                  </Avatar>
                  {me.data ? (
                    <span className="truncate text-foreground text-sm">
                      {me.data.username}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">加载中…</span>
                  )}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {me.data?.role === 'admin' ? (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem render={<Link to="/admin" />}>
                      <ShieldCheck />
                      管理后台
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setPasswordOpen(true)}>
                  <KeyRound />
                  修改密码
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={logout}>
                  <LogOut />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">我的设备</h1>
            <p className="text-muted-foreground">
              每台设备都是一个有名字、有性格的语音伙伴。
            </p>
          </div>
          <DialogTrigger handle={addHandle} render={<Button size="lg" />}>
            <Plus />
            添加设备
          </DialogTrigger>
        </div>
        {devices.isPending ? (
          <p className="py-28 text-center text-muted-foreground">加载中…</p>
        ) : devices.isError ? (
          <p className="py-28 text-center text-muted-foreground">
            设备列表加载失败，请刷新重试
          </p>
        ) : devices.data.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {devices.data.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 rounded-3xl border border-dashed bg-card/60 py-20 text-center">
            <VoiceBars className="text-primary/40" />
            <div className="space-y-2">
              <p className="text-xl font-semibold">还没有设备</p>
              <p className="mx-auto max-w-md text-balance text-muted-foreground">
                拿出设备接通电源，屏幕会显示 6 位激活码，在这里输入即可添加，
                添加后马上就能开口聊天。
              </p>
            </div>
            <DialogTrigger
              handle={addHandle}
              render={<Button size="lg" className="mt-2" />}
            >
              <Plus />
              添加设备
            </DialogTrigger>
          </div>
        )}
      </main>
      {/* 添加设备弹窗根：触发点经 handle 关联；关闭即卸载，激活码与错误随之重置 */}
      <Dialog handle={addHandle}>
        <AddDeviceDialogContent
          onAdded={(id) => {
            // 失效列表再进见面页；即使跳转被弹回，状态也已正确
            void queryClient.invalidateQueries({ queryKey: ['devices'] });
            void navigate({
              to: '/devices/$deviceId/meet',
              params: { deviceId: String(id) },
            });
          }}
        />
      </Dialog>
      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </div>
  );
}

/** MAC 打码展示：中段两对掩码，首尾各两对明文；不足 12 位统一给全掩码 */
function maskedMac(mac: string | null): string {
  const hex = (mac ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length < 12) {
    return '••:••:••:••:••:••';
  }
  const pair = (i: number) => hex.slice(i * 2, i * 2 + 2);
  return [pair(0), pair(1), '••', '••', pair(4), pair(5)].join(':');
}

function DeviceCard({ device }: { device: DeviceInfo }) {
  const queryClient = useQueryClient();
  // 命令式句柄：保存成功后再关弹窗，失败留在原地展示错误
  const [editHandle] = useState(() =>
    DialogPrimitive.createHandle<DeviceInfo>(),
  );

  const unbindDevice = useMutation({
    mutationFn: (id: number) => deviceApi.unbind(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      // 卡片随列表刷新卸载，弹窗随之消失
    },
  });

  return (
    <Card className="transition-shadow hover:shadow-md hover:shadow-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 overflow-hidden">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500/15 to-fuchsia-500/15 font-semibold text-primary text-lg">
            {device.name.charAt(0)}
          </span>
          <span className="truncate text-lg font-semibold tracking-tight">
            {device.name}
          </span>
        </CardTitle>
        <CardAction>
          <Badge variant="secondary" className="gap-2 rounded-full px-2 py-1">
            <span className="relative flex size-2">
              {device.online && (
                // 在线脉冲：内置 animate-ping 外圈，装饰性即可
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-60 motion-reduce:animate-none" />
              )}
              <span
                className={`relative inline-flex size-2 rounded-full ${
                  device.online ? 'bg-green-500' : 'bg-zinc-400'
                }`}
              />
            </span>
            {device.online ? '在线' : '离线'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-2 leading-relaxed text-muted-foreground">
          {device.systemPrompt}
        </p>
        <p className="mt-3 text-xs tabular-nums text-muted-foreground/70">
          MAC {maskedMac(device.mac)}
        </p>
      </CardContent>
      <CardFooter className="grid grid-cols-2 gap-3 p-3">
        <Dialog handle={editHandle}>
          <DialogTrigger
            render={<Button variant="outline" className="w-full" />}
          >
            <SquarePen />
            编辑
          </DialogTrigger>
          <DialogContent className="max-h-[85svh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
            <EditCompanionForm
              device={device as DeviceInfo}
              handle={editHandle}
            />
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="outline" className="w-full" />}
          >
            <Trash2 />
            解绑
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>解绑设备</AlertDialogTitle>
              <AlertDialogDescription>
                确定解绑「
                {device.name}
                」？设备将回到未激活状态，可被任意账号重新添加。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => unbindDevice.mutate(device.id)}
              >
                解绑
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

/** 编辑伙伴表单：弹窗每次打开重新挂载，字段从设备当前值初始化 */
function EditCompanionForm({
  device,
  handle,
}: {
  device: DeviceInfo;
  handle: DialogPrimitive.Handle<DeviceInfo>;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(device.name);
  const [systemPrompt, setSystemPrompt] = useState(device.systemPrompt);
  const [voice, setVoice] = useState(device.voice);

  const save = useMutation({
    mutationFn: () => {
      const prompt = systemPrompt.trim();
      return deviceApi.update(device.id, {
        name: name.trim(),
        voice,
        // 自定义文本清空时不带 systemPrompt，保留现值
        ...(prompt !== '' && { systemPrompt: prompt }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      handle.close();
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>编辑伙伴</DialogTitle>
        <DialogDescription>
          名字、性格与声音保存后，下一轮对话即生效。
        </DialogDescription>
      </DialogHeader>
      {/* 中段可滚、头尾固定：行轨道 minmax(0,1fr) 允许收缩 */}
      {/* px-4 -mx-4 抵消：给 focus ring 留横向空间，不被滚动容器裁切 */}
      <div className="scrollbar-none -mx-4 min-h-0 overflow-y-auto px-4">
        <div className="grid gap-5">
          <Field>
            <FieldLabel htmlFor="edit-name" className="font-semibold">
              名字
            </FieldLabel>
            <Input
              id="edit-name"
              value={name}
              maxLength={20}
              placeholder="给伙伴起个名字"
              onChange={(e) => setName(e.target.value)}
            />
            <FieldDescription>
              唤醒词由设备内置固定，名字不会改变唤醒方式。
            </FieldDescription>
          </Field>
          <CompanionSettings
            systemPrompt={systemPrompt}
            voice={voice}
            onPromptChange={setSystemPrompt}
            onVoiceChange={setVoice}
          />
        </div>
        {save.isError && <p className="text-destructive">保存失败，请重试</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => handle.close()}>
          取消
        </Button>
        <Button
          disabled={name.trim() === '' || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? '保存中…' : '保存'}
        </Button>
      </DialogFooter>
    </>
  );
}

/** 添加设备弹窗内容：输 6 位激活码，成功后进入见面页（触发点由页面提供） */
function AddDeviceDialogContent({
  onAdded,
}: {
  onAdded: (deviceId: number) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: deviceApi.add,
    // 400/409 已在 api 层映射为结果对象，401 由 use401Redirect 接管
    onError: (err) => {
      if (!isUnauthorized(err)) {
        setError(errorText(err));
      }
    },
  });
  use401Redirect(add.error);

  function submit() {
    setError(null);
    add.mutate(code, {
      onSuccess: (result) => {
        if (result.ok) {
          setCode('');
          onAdded(result.device.id);
        } else {
          setError(
            result.reason === 'taken'
              ? '设备已被其他用户绑定'
              : '激活码无效或已过期',
          );
        }
      },
    });
  }

  const ready = /^\d{6}$/.test(code);

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="font-semibold">添加设备</DialogTitle>
        <DialogDescription>
          接通电源后，设备屏幕会显示 6 位激活码，输入即可添加这台设备。
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel>激活码</FieldLabel>
        <InputOTP
          value={code}
          onChange={setCode}
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          containerClassName="justify-center gap-3 py-2"
          onKeyDown={(e) => e.key === 'Enter' && ready && submit()}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot
              key={i}
              index={i}
              // 独立间隔槽而非相邻拼接：important 压过组件内置的
              // first:rounded-l-lg / last:rounded-r-lg，四角统一 lg
              className="size-13 rounded-lg! border-l text-xl font-semibold tabular-nums"
            />
          ))}
        </InputOTP>
        {error && <p className="text-destructive">{error}</p>}
      </Field>
      <DialogFooter>
        <Button
          size="lg"
          disabled={!ready || add.isPending}
          onClick={submit}
          className="w-full"
        >
          {add.isPending ? '添加中…' : '添加'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
