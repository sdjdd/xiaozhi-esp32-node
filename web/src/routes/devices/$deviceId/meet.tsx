import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { TOKEN_KEY } from '@/api/client';
import { deviceApi } from '@/api/device';
import type { DeviceInfo } from '@/api/device';
import { personasApi } from '@/api/persona';
import { Backdrop } from '@/components/ambient';
import { CompanionSettings } from '@/components/companion-settings';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/devices/$deviceId/meet')({
  beforeLoad: () => {
    if (localStorage.getItem(TOKEN_KEY) === null) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async ({ params }) => {
    const device = await deviceApi.get(Number(params.deviceId));
    // 找不到（如刷新后已解绑）就回设备页
    if (!device) throw redirect({ to: '/devices' });
    return device;
  },
  component: MeetPage,
});

/** 见面页：添加成功后给伙伴起名、选性格，可跳过（用默认） */
function MeetPage() {
  const device = Route.useLoaderData();
  const personas = useQuery({
    queryKey: ['personas'],
    queryFn: personasApi.list,
  });

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      <Backdrop />
      <Card className="relative z-10 w-full max-w-lg px-2 pt-8 pb-4">
        {personas.isPending || personas.isError ? (
          <CardContent className="py-14 text-center text-muted-foreground">
            {personas.isPending ? '加载中…' : '性格加载失败，请刷新重试'}
          </CardContent>
        ) : (
          <MeetForm
            device={device}
            defaultPersona={personas.data[0]?.systemPrompt ?? ''}
          />
        )}
      </Card>
    </main>
  );
}

function MeetForm({
  device,
  defaultPersona,
}: {
  device: DeviceInfo;
  defaultPersona: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(device.name);
  const [prompt, setPrompt] = useState(defaultPersona);
  const [voice, setVoice] = useState(device.voice);

  const save = useMutation({
    mutationFn: () =>
      deviceApi.update(device.id, {
        name: name.trim() === '' ? device.name : name.trim(),
        systemPrompt: prompt.trim() === '' ? defaultPersona : prompt.trim(),
        voice,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void navigate({ to: '/devices' });
    },
  });

  // 极端情况（预设被清空且未自定义）下无性格可落库，禁用保存
  const canSave = prompt.trim() !== '' || defaultPersona !== '';

  return (
    <>
      <CardHeader className="items-center gap-1.5 text-center">
        <CardTitle className="text-xl">认识一下吧</CardTitle>
        <CardDescription>给你的新伙伴起个名字，再选一个性格</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <Field>
          <FieldLabel htmlFor="meet-name">名字</FieldLabel>
          <Input
            id="meet-name"
            className="h-9"
            value={name}
            maxLength={20}
            placeholder="给伙伴起个名字"
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <FieldDescription>
            唤醒词由设备内置固定，名字不会改变唤醒方式，只用于展示和对话中的自称。
          </FieldDescription>
        </Field>
        <CompanionSettings
          systemPrompt={prompt}
          voice={voice}
          onPromptChange={setPrompt}
          onVoiceChange={setVoice}
        />
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            variant="outline"
            onClick={() => void navigate({ to: '/devices' })}
          >
            先跳过
          </Button>
          <Button
            size="lg"
            disabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? '保存中…' : '开始相处'}
          </Button>
        </div>
        {save.isError && <p className="text-destructive">保存失败，请重试</p>}
      </CardContent>
    </>
  );
}
