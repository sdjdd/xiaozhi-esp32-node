import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import type { SortingState } from '@tanstack/react-table';
import { createFileRoute } from '@tanstack/react-router';
import { HTTPError } from 'ky';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { personasApi } from '@/api/persona';
import type { PersonaPreset } from '@/api/persona';
import { PageGlow } from '@/components/ambient';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DataTable, DataTableSortHeader } from '@/components/data-table';
import type { DataTableFeatures } from '@/components/data-table';
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
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
import { AdminPageHeader } from './route';

export const Route = createFileRoute('/admin/personas')({
  component: AdminPersonas,
});

function AdminPersonas() {
  const personas = useQuery({
    queryKey: ['personas'],
    queryFn: personasApi.list,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ]);
  // 删除失败的错误冒泡到页头横幅；列定义每轮重建以携带最新回调
  const columns = getPersonaColumns(setActionError, () => setActionError(null));

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 py-10">
      <PageGlow />
      <AdminPageHeader
        title="预设角色"
        description="添加设备时的性格候选；名称即唯一事实源，改动即时对全站生效。"
      >
        <PersonaDialog>
          <Button size="lg">
            <Plus />
            新建预设
          </Button>
        </PersonaDialog>
      </AdminPageHeader>

      {actionError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {personas.isError ? (
        <p className="mt-8 py-28 text-center text-muted-foreground">
          预设加载失败，请刷新重试
        </p>
      ) : personas.isPending ? (
        <Loader2 className="mx-auto mt-16 block size-6 animate-spin text-muted-foreground" />
      ) : (
        <div className="mt-8">
          <DataTable
            columns={columns}
            data={personas.data}
            sorting={sorting}
            onSortingChange={setSorting}
            empty="还没有预设"
          />
        </div>
      )}
    </div>
  );
}

const columnHelper = createColumnHelper<DataTableFeatures, PersonaPreset>();

function getPersonaColumns(
  onError: (message: string) => void,
  onClearError: () => void,
) {
  return columnHelper.columns([
    columnHelper.accessor('name', {
      header: ({ column }) => (
        <DataTableSortHeader column={column} title="名称" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    }),
    columnHelper.accessor('systemPrompt', {
      header: '性格提示词',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          <p className="line-clamp-1 max-w-xl">{row.original.systemPrompt}</p>
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => (
        <PersonaActions
          persona={row.original}
          onError={onError}
          onClearError={onClearError}
        />
      ),
    }),
  ]);
}

/** 行操作：编辑弹窗 + 删除确认（错误冒泡到页头横幅） */
function PersonaActions({
  persona,
  onError,
  onClearError,
}: {
  persona: PersonaPreset;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <PersonaDialog persona={persona}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`编辑 ${persona.name}`}
        >
          <Pencil />
        </Button>
      </PersonaDialog>
      <PersonaRemove
        persona={persona}
        onError={onError}
        onClearError={onClearError}
      />
    </div>
  );
}

/** 新建/编辑双用弹窗：传 persona 即编辑；表单状态在弹窗内层组件，关闭即重置 */
function PersonaDialog({
  persona,
  children,
}: {
  persona?: PersonaPreset;
  children: React.ReactElement;
}) {
  const handle = useState(() => DialogPrimitive.createHandle())[0];

  return (
    <Dialog handle={handle}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-md">
        <PersonaForm persona={persona} handle={handle} />
      </DialogContent>
    </Dialog>
  );
}

function PersonaForm({
  persona,
  handle,
}: {
  persona?: PersonaPreset;
  handle: DialogPrimitive.Handle<unknown>;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(persona?.name ?? '');
  const [systemPrompt, setSystemPrompt] = useState(persona?.systemPrompt ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (): Promise<unknown> => {
      const body = { name: name.trim(), systemPrompt: systemPrompt.trim() };
      return persona
        ? personasApi.update(persona.id, body)
        : personasApi.create(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['personas'] });
      // 保存成功才关窗；失败留在原地展示错误
      handle.close();
    },
    onError: (err) => {
      setError(describeSaveError(err, '预设名称已被占用'));
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {persona ? `编辑「${persona.name}」` : '新建预设'}
        </DialogTitle>
        <DialogDescription>
          性格提示词会作为系统提示词拼进对话。
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-5">
        <Field>
          <FieldLabel htmlFor="persona-name">名称</FieldLabel>
          <Input
            id="persona-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：睡前故事"
            className="h-9"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="persona-prompt">性格提示词</FieldLabel>
          <Textarea
            id="persona-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="描述说话风格与人设，一两句即可"
            className="min-h-32"
          />
          <FieldDescription>名称重复会保存失败（409）。</FieldDescription>
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

function PersonaRemove({
  persona,
  onError,
  onClearError,
}: {
  persona: PersonaPreset;
  onError: (message: string) => void;
  onClearError: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => personasApi.remove(persona.id),
    onSuccess: () => {
      onClearError();
      void queryClient.invalidateQueries({ queryKey: ['personas'] });
    },
    onError: () => onError(`「${persona.name}」删除失败，请重试`),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            aria-label={`删除 ${persona.name}`}
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除「{persona.name}」？</AlertDialogTitle>
          <AlertDialogDescription>
            已添加的设备不受影响（性格保存在设备伙伴上），但新设备将不再出现该选项。
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

function describeSaveError(err: unknown, takenMessage: string): string {
  if (err instanceof HTTPError && err.response.status === 409) {
    return takenMessage;
  }
  return '保存失败，请重试';
}
