import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { errorText, isUnauthorized } from '@/api/errors';
import { userApi } from '@/api/user';
import { use401Redirect } from '@/hooks/use-401-redirect';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/** 与服务端 changePasswordSchema（server/src/routers/user.ts）对齐 */
const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(8, '密码长度需为 8-128 位')
      .max(128, '密码长度需为 8-128 位'),
    newPassword: z
      .string()
      .min(8, '密码长度需为 8-128 位')
      .max(128, '密码长度需为 8-128 位'),
    confirmPassword: z.string().min(1, '请再次输入新密码'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: '两次输入的新密码不一致',
    path: ['confirmPassword'],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/**
 * 修改密码弹窗（受控）：打开状态由调用方持有，成功即关闭并重置。
 * 当前密码错误服务端回 400（非 401，避免误触发登出）
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: userApi.changePassword,
    onSuccess: () => {
      form.reset();
      onOpenChange(false);
    },
    onError: (err) => {
      // 401 交 use401Redirect 清凭证回登录页，这里只提示业务失败
      if (!isUnauthorized(err)) {
        setError(errorText(err, { 400: '当前密码不正确' }));
      }
    },
  });
  use401Redirect(change.error);

  function close() {
    setError(null);
    form.reset();
    onOpenChange(false);
  }

  function submit(values: ChangePasswordValues) {
    setError(null);
    change.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
        } else {
          close();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>
            修改后请用新密码重新登录其它设备。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="grid gap-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field
            data-invalid={
              form.formState.errors.currentPassword ? true : undefined
            }
          >
            <FieldLabel htmlFor="change-password-current">当前密码</FieldLabel>
            <Input
              id="change-password-current"
              type="password"
              autoComplete="current-password"
              {...form.register('currentPassword')}
            />
            <FieldError errors={[form.formState.errors.currentPassword]} />
          </Field>
          <Field
            data-invalid={form.formState.errors.newPassword ? true : undefined}
          >
            <FieldLabel htmlFor="change-password-new">新密码</FieldLabel>
            <Input
              id="change-password-new"
              type="password"
              autoComplete="new-password"
              placeholder="至少 8 位"
              {...form.register('newPassword')}
            />
            <FieldError errors={[form.formState.errors.newPassword]} />
          </Field>
          <Field
            data-invalid={
              form.formState.errors.confirmPassword ? true : undefined
            }
          >
            <FieldLabel htmlFor="change-password-confirm">
              确认新密码
            </FieldLabel>
            <Input
              id="change-password-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="再次输入新密码"
              {...form.register('confirmPassword')}
            />
            <FieldError errors={[form.formState.errors.confirmPassword]} />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={change.isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? '提交中…' : '确认修改'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
