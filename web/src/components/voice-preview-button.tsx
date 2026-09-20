import { Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** 试听播放/停止按钮；未配置试听地址时禁用。阻断冒泡以便嵌入可点击容器 */
export function VoicePreviewButton({
  name,
  url,
  playing,
  onToggle,
  className,
}: {
  name: string;
  url: string | null;
  playing: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={playing ? `停止试听 ${name}` : `试听 ${name}`}
      title={url ? '试听' : '未配置试听地址'}
      disabled={!url}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {playing ? (
        <Square className="fill-current" />
      ) : (
        <Play className="fill-current" />
      )}
    </Button>
  );
}
