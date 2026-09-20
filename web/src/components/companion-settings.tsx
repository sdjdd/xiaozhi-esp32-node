import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { personasApi } from '@/api/persona';
import { voicesApi } from '@/api/voice';
import { useAudioPreview } from '@/hooks/use-audio-preview';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { VoicePreviewButton } from '@/components/voice-preview-button';

/** 性格选择状态：选中预设的文本，或自定义文本 */
interface Selection {
  preset: string | null;
  custom: string;
}

const CHIP_CLS = cn(
  'rounded-xl border p-3.5 text-left transition-colors hover:bg-muted/50',
  'data-[selected]:border-primary data-[selected]:bg-primary/10',
);

export interface CompanionSettingsProps {
  /** 当前性格文本（预设文本或自定义文本） */
  systemPrompt: string;
  /** 当前音色代码（voices.voice） */
  voice: string;
  onPromptChange: (prompt: string) => void;
  onVoiceChange: (voice: string) => void;
}

/**
 * 伙伴设置：性格 + 声音两段，见面页与设备页编辑弹窗共用。
 * 性格以预设格子为主、自定义作为高级入口（选中才展开大输入框）；
 * 声音为单选格子，候选项来自服务端音色清单。未交互时按当前值
 * 匹配推导选中项，交互后把最终结果经 onChange 上抛
 */
export function CompanionSettings({
  systemPrompt,
  voice,
  onPromptChange,
  onVoiceChange,
}: CompanionSettingsProps) {
  const {
    data: presets,
    isPending: personasPending,
    isError: personasError,
  } = useQuery({
    queryKey: ['personas'],
    queryFn: personasApi.list,
  });
  const {
    data: voices,
    isPending: voicesPending,
    isError: voicesError,
  } = useQuery({
    queryKey: ['voices'],
    queryFn: voicesApi.list,
  });

  // undefined = 尚未交互，选中项由 systemPrompt 匹配预设推导
  const [selected, setSelected] = useState<Selection | undefined>();
  const { playingKey, toggle } = useAudioPreview();
  const matched = presets?.find((p) => p.systemPrompt === systemPrompt) ?? null;
  const sel: Selection = selected ?? {
    preset: matched?.systemPrompt ?? null,
    custom: matched ? '' : systemPrompt,
  };

  return (
    <div className="grid gap-6">
      <Field>
        <FieldLabel className="font-semibold">声音</FieldLabel>
        {voicesPending ? (
          <p className="text-muted-foreground">声音加载中…</p>
        ) : voicesError ? (
          <p className="text-destructive">声音加载失败，请重试</p>
        ) : (
          <Combobox
            items={voices.map((item) => item.name)}
            // 展示名作候选项，选中后反查音色代码上抛；
            // 当前音色不在清单（如被删）时回退显示原始代码
            value={voices.find((item) => item.voice === voice)?.name ?? voice}
            onValueChange={(name) => {
              const match = voices.find((item) => item.name === name);
              if (match) {
                onVoiceChange(match.voice);
              }
            }}
          >
            <ComboboxInput placeholder="选择声音" />
            <ComboboxContent>
              <ComboboxEmpty>没有匹配的声音</ComboboxEmpty>
              <ComboboxList>
                {(name) => {
                  const item = voices.find((v) => v.name === name);
                  return (
                    <ComboboxItem key={name} value={name}>
                      <VoicePreviewButton
                        name={name}
                        url={item?.previewUrl ?? null}
                        playing={!!item && playingKey === item.voice}
                        onToggle={() => {
                          if (item?.previewUrl) {
                            toggle(item.voice, item.previewUrl);
                          }
                        }}
                      />
                      {name}
                    </ComboboxItem>
                  );
                }}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        )}
        <FieldDescription>
          音色保存后从下一轮对话开始生效，可在设备上直接说句话试听。
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel className="font-semibold">性格</FieldLabel>
        {personasPending ? (
          <p className="text-muted-foreground">性格加载中…</p>
        ) : personasError ? (
          <p className="text-destructive">性格加载失败，请重试</p>
        ) : (
          <>
            {presets.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-selected={
                      sel.preset === preset.systemPrompt || undefined
                    }
                    className={CHIP_CLS}
                    onClick={() => {
                      setSelected({
                        preset: preset.systemPrompt,
                        custom: sel.custom,
                      });
                      onPromptChange(preset.systemPrompt);
                    }}
                  >
                    <span className="block font-semibold">{preset.name}</span>
                    <span className="mt-1 block line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {preset.systemPrompt}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              data-selected={sel.preset === null || undefined}
              className={CHIP_CLS}
              onClick={() =>
                // 从预设切到自定义时，把预设文本带进输入框，方便改着写
                setSelected({ preset: null, custom: sel.preset ?? sel.custom })
              }
            >
              <span className="flex items-center gap-2 font-semibold">
                <PenLine className="size-4" />
                自定义性格
              </span>
              <span className="mt-1 block line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                用自己的话描述它的性格
              </span>
            </button>
            {sel.preset === null && (
              <Textarea
                value={sel.custom}
                maxLength={2000}
                placeholder="例如：温柔耐心的英语老师，喜欢用生活里的比喻"
                className="min-h-32"
                autoFocus
                onChange={(e) => {
                  setSelected({ preset: null, custom: e.target.value });
                  onPromptChange(e.target.value);
                }}
              />
            )}
            <FieldDescription>
              名字和性格之后都可以在设备页随时修改。
            </FieldDescription>
          </>
        )}
      </Field>
    </div>
  );
}
