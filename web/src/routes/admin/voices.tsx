import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import type { SortingState } from '@tanstack/react-table';
import { createFileRoute } from '@tanstack/react-router';
import { HTTPError } from 'ky';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { voicesApi } from '@/api/voice';
import type { VoiceInfo } from '@/api/voice';
import { PageGlow } from '@/components/ambient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DataTable, DataTableSortHeader } from '@/components/data-table';
import type { DataTableFeatures } from '@/components/data-table';
import { VoicePreviewButton } from '@/components/voice-preview-button';
import { useAudioPreview } from '@/hooks/use-audio-preview';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AdminPageHeader } from './route';

export const Route = createFileRoute('/admin/voices')({
  component: AdminVoices,
});

function AdminVoices() {
  const voices = useQuery({ queryKey: ['voices'], queryFn: voicesApi.list });
  const [actionError, setActionError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ]);
  const preview = useAudioPreview();
  // 删除失败的错误冒泡到页头横幅；列定义每轮重建以携带最新回调
  const columns = getVoiceColumns(
    setActionError,
    () => setActionError(null),
    preview,
  );

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 py-10">
      <PageGlow />
      <AdminPageHeader
        title="音色管理"
        description="伙伴声音的候选清单；展示名与火山音色代码均唯一，试听音频走 CDN 地址。"
      >
        <VoiceDialog>
          <Button size="lg">
            <Plus />
            新增音色
          </Button>
        </VoiceDialog>
      </AdminPageHeader>

      {actionError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {voices.isError ? (
        <p className="mt-8 py-28 text-center text-muted-foreground">
          音色清单加载失败，请刷新重试
        </p>
      ) : voices.isPending ? (
        <Loader2 className="mx-auto mt-16 block size-6 animate-spin text-muted-foreground" />
      ) : (
        <div className="mt-8">
          <DataTable
            columns={columns}
            data={voices.data}
            sorting={sorting}
            onSortingChange={setSorting}
            empty="还没有音色"
          />
        </div>
      )}
    </div>
  );
}

const columnHelper = createColumnHelper<DataTableFeatures, VoiceInfo>();

function getVoiceColumns(
  onError: (message: string) => void,
  onClearError: () => void,
  preview: ReturnType<typeof useAudioPreview>,
) {
  return columnHelper.columns([
    columnHelper.accessor('name', {
      header: ({ column }) => (
        <DataTableSortHeader column={column} title="展示名" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    }),
    columnHelper.accessor('voice', {
      header: ({ column }) => (
        <DataTableSortHeader column={column} title="音色代码" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground font-mono text-sm">
          {row.original.voice}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'preview',
      header: () => <div>试听</div>,
      cell: ({ row }) => {
        const voice = row.original;
        return (
          <div className="flex items-center gap-2">
            <VoicePreviewButton
              name={voice.name}
              url={voice.previewUrl}
              playing={preview.playingKey === voice.voice}
              onToggle={() => {
                if (voice.previewUrl) {
                  preview.toggle(voice.voice, voice.previewUrl);
                }
              }}
            />
            {voice.previewUrl ? (
              <span className="max-w-64 truncate text-muted-foreground text-xs">
                {voice.previewUrl}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">未配置</span>
            )}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => (
        <VoiceActions
          voice={row.original}
          onError={onError}
          onClearError={onClearError}
        />
      ),
    }),
  ]);
}

/** 行操作：编辑弹窗 + 删除确认（错误冒泡到页头横幅） */
function VoiceActions({
  voice,
  onError,
  onClearError,
}: {
  voice: VoiceInfo;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <VoiceDialog voice={voice}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`编辑 ${voice.name}`}
        >
          <Pencil />
        </Button>
      </VoiceDialog>
      <VoiceRemove
        voice={voice}
        onError={onError}
        onClearError={onClearError}
      />
    </div>
  );
}

/** 新增/编辑双用弹窗；表单状态在弹窗内层组件，关闭即重置 */
function VoiceDialog({
  voice,
  children,
}: {
  voice?: VoiceInfo;
  children: React.ReactElement;
}) {
  const handle = useState(() => DialogPrimitive.createHandle())[0];

  return (
    <Dialog handle={handle}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <VoiceForm voice={voice} handle={handle} />
      </DialogContent>
    </Dialog>
  );
}

function VoiceForm({
  voice,
  handle,
}: {
  voice?: VoiceInfo;
  handle: DialogPrimitive.Handle<unknown>;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(voice?.name ?? '');
  const [code, setCode] = useState(voice?.voice ?? '');
  const [previewUrl, setPreviewUrl] = useState(voice?.previewUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (): Promise<unknown> => {
      const body = {
        name: name.trim(),
        voice: code.trim(),
        previewUrl: previewUrl.trim() || null,
      };
      return voice ? voicesApi.update(voice.id, body) : voicesApi.create(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voices'] });
      // 保存成功才关窗；失败留在原地展示错误
      handle.close();
    },
    onError: (err) => {
      setError(describeSaveError(err));
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {voice ? `编辑「${voice.name}」` : '新增音色'}
        </DialogTitle>
        <DialogDescription>
          音色代码来自火山引擎 TTS（如 zh_female_xiaohe_uranus_bigtts）。
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-5">
        <Field>
          <FieldLabel htmlFor="voice-name">展示名</FieldLabel>
          <Input
            id="voice-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：小何"
            className="h-9"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="voice-code">音色代码</FieldLabel>
          <Input
            id="voice-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="zh_female_..."
            className="h-9 font-mono"
          />
          <FieldDescription>
            展示名与代码任一重复都会保存失败。
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="voice-preview">试听地址</FieldLabel>
          <Input
            id="voice-preview"
            value={previewUrl}
            onChange={(e) => setPreviewUrl(e.target.value)}
            placeholder="https://cdn.example.com/xiaohe.mp3"
            className="h-9"
          />
          <FieldDescription>
            可公开访问的音频 CDN 地址（http/https）；留空即未配置。
          </FieldDescription>
        </Field>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button
          size="lg"
          disabled={save.isPending}
          onClick={() => {
            setError(null);
            save.mutate();
          }}
        >
          {save.isPending ? <Loader2 className="animate-spin" /> : null}
          保存
        </Button>
      </DialogFooter>
    </>
  );
}

function VoiceRemove({
  voice,
  onError,
  onClearError,
}: {
  voice: VoiceInfo;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => voicesApi.remove(voice.id),
    onSuccess: () => {
      onClearError();
      void queryClient.invalidateQueries({ queryKey: ['voices'] });
    },
    onError: () => onError(`「${voice.name}」删除失败，请重试`),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            aria-label={`删除 ${voice.name}`}
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除「{voice.name}」？</AlertDialogTitle>
          <AlertDialogDescription>
            已使用该音色的伙伴不受影响（音色快照存在设备伙伴上），但候选清单将不再出现。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? <Loader2 className="animate-spin" /> : null}
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function describeSaveError(err: unknown): string {
  if (err instanceof HTTPError) {
    if (err.response.status === 409) {
      return '展示名或音色代码已被占用';
    }
    if (err.response.status === 400) {
      return '名称、音色代码或试听地址不合法';
    }
  }
  return '保存失败，请重试';
}
