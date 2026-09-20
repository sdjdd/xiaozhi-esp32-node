import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { authApi } from '@/api/auth';
import type { Credentials } from '@/api/auth';
import { TOKEN_KEY } from '@/api/client';
import { errorText } from '@/api/errors';
import { Backdrop, BrandMark } from '@/components/ambient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** 与服务端 credentialsSchema（server/src/routers/auth.ts）对齐 */
const credentialsSchema = z.object({
  username: z
    .string()
    .regex(
      /^[a-zA-Z0-9_-]{3,32}$/,
      '用户名需为 3-32 位字母、数字、下划线或连字符',
    ),
  password: z
    .string()
    .min(8, '密码长度需为 8-128 位')
    .max(128, '密码长度需为 8-128 位'),
});

/** 注册独有：确认密码，与服务端契约无关 */
const registerSchema = credentialsSchema
  .extend({
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

type RegisterCredentials = z.infer<typeof registerSchema>;

/** 登录/注册服务端失败 → 表单内 Alert 文案；401/409 按登录语境覆盖通用措辞 */
function useServerErrorMessage() {
  const [error, setError] = useState<string | null>(null);
  const onError = (err: Error) =>
    setError(
      errorText(err, {
        401: '用户名或密码错误',
        409: '用户名已被占用',
      }),
    );
  return { error, onError, setError };
}

/**
 * 两个表单共用的字段装配：RHF register + Field/FieldError 展示校验错误。
 * 只收 register/errors 而非整个 form 实例——注册表的 confirmPassword
 * 字段经函数参数逆变天然兼容，不必上泛型
 */
function CredentialFormFields({
  register,
  errors,
  idPrefix,
  passwordAutoComplete,
}: {
  register: UseFormRegister<Credentials>;
  errors: FieldErrors<Credentials>;
  idPrefix: string;
  passwordAutoComplete: string;
}) {
  return (
    <>
      <Field data-invalid={errors.username ? true : undefined}>
        <FieldLabel htmlFor={`${idPrefix}-username`}>用户名</FieldLabel>
        <Input
          id={`${idPrefix}-username`}
          autoComplete="username"
          placeholder="3-32 位字母/数字/_/-"
          {...register('username')}
        />
        <FieldError errors={[errors.username]} />
      </Field>
      <Field data-invalid={errors.password ? true : undefined}>
        <FieldLabel htmlFor={`${idPrefix}-password`}>密码</FieldLabel>
        <Input
          id={`${idPrefix}-password`}
          type="password"
          autoComplete={passwordAutoComplete}
          placeholder="至少 8 位"
          {...register('password')}
        />
        <FieldError errors={[errors.password]} />
      </Field>
    </>
  );
}

export const Route = createFileRoute('/login')({
  /** 已登录访问登录页 → 控制台 */
  beforeLoad: () => {
    if (localStorage.getItem(TOKEN_KEY) !== null) {
      throw redirect({ to: '/devices' });
    }
  },
  component: LoginComponent,
});

/** 登录表单：纯展示，校验通过后把凭据上抛，登录动作由父组件执行 */
function LoginForm({
  notice,
  error,
  submitting,
  onSubmit,
}: {
  notice: string | null;
  error: string | null;
  submitting: boolean;
  onSubmit: (values: Credentials) => void;
}) {
  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { username: '', password: '' },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5 pt-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <CredentialFormFields
        register={form.register}
        errors={form.formState.errors}
        idPrefix="login"
        passwordAutoComplete="current-password"
      />
      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting ? '登录中…' : '登录'}
      </Button>
    </form>
  );
}

/** 注册表单：纯展示，剥离确认密码后把凭据上抛，注册动作由父组件执行 */
function RegisterForm({
  error,
  submitting,
  onSubmit,
}: {
  error: string | null;
  submitting: boolean;
  onSubmit: (values: Credentials) => void;
}) {
  const form = useForm<RegisterCredentials>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', password: '', confirmPassword: '' },
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        onSubmit({
          username: values.username,
          password: values.password,
        }),
      )}
      className="grid gap-5 pt-2"
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <CredentialFormFields
        register={form.register}
        errors={form.formState.errors}
        idPrefix="register"
        passwordAutoComplete="new-password"
      />
      <Field
        data-invalid={form.formState.errors.confirmPassword ? true : undefined}
      >
        <FieldLabel htmlFor="register-confirm-password">确认密码</FieldLabel>
        <Input
          id="register-confirm-password"
          className="h-9"
          type="password"
          autoComplete="new-password"
          placeholder="再次输入密码"
          {...form.register('confirmPassword')}
        />
        <FieldError errors={[form.formState.errors.confirmPassword]} />
      </Field>
      <Button type="submit" size="lg" disabled={submitting} className="w-full">
        {submitting ? '注册中…' : '注册'}
      </Button>
    </form>
  );
}

function LoginComponent() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [notice, setNotice] = useState<string | null>(null);
  const {
    error: loginError,
    onError: onLoginError,
    setError: setLoginError,
  } = useServerErrorMessage();
  const {
    error: registerError,
    onError: onRegisterError,
    setError: setRegisterError,
  } = useServerErrorMessage();

  const loginMutation = useMutation({
    mutationFn: (values: Credentials) => authApi.login(values),
    onSuccess: ({ token }) => {
      localStorage.setItem(TOKEN_KEY, token);
      void navigate({ to: '/devices' });
    },
    onError: onLoginError,
  });

  const registerMutation = useMutation({
    mutationFn: (values: Credentials) => authApi.register(values),
    onSuccess: () => setNotice('注册成功，请登录'),
    onError: onRegisterError,
  });

  /** 任一提交进行中即锁定 Tab 切换 */
  const busy = loginMutation.isPending || registerMutation.isPending;

  function handleLogin(values: Credentials) {
    setLoginError(null);
    setNotice(null);
    loginMutation.mutate(values);
  }

  function handleRegister(values: Credentials) {
    setRegisterError(null);
    setNotice(null);
    registerMutation.mutate(values);
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      <Backdrop />
      <Card className="relative z-10 w-90 max-w-md px-2 py-8">
        <CardHeader className="items-center gap-4 text-center">
          <BrandMark className="mx-auto size-14 rounded-2xl" />
          <div className="space-y-1.5">
            <CardTitle className="text-xl">语音助手控制台</CardTitle>
            <CardDescription>登录或注册以管理你的设备</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value as 'login' | 'register');
              setNotice(null);
            }}
          >
            <TabsList className="h-11 w-full">
              <TabsTrigger value="login" className="flex-1" disabled={busy}>
                登录
              </TabsTrigger>
              <TabsTrigger value="register" className="flex-1" disabled={busy}>
                注册
              </TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <LoginForm
                notice={notice}
                error={loginError}
                submitting={loginMutation.isPending}
                onSubmit={handleLogin}
              />
            </TabsContent>
            <TabsContent value="register">
              <RegisterForm
                error={registerError}
                submitting={registerMutation.isPending}
                onSubmit={handleRegister}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}
