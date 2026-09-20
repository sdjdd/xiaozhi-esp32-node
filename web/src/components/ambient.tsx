import { Bot, Mic, Sparkles, AudioLines } from 'lucide-react';
import { cn } from 'cn';

/**
 * 声波条（纯装饰均衡器）：中轴高、两侧低，往复起伏错峰呼吸，
 * 隐喻设备正在「说话」。空状态与品牌块用；不承载语义，aria-hidden 由调用方保证
 */
const BAR_HEIGHTS = ['h-3', 'h-7', 'h-11', 'h-7', 'h-3'];

export function VoiceBars({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-end gap-1.5', className)}>
      {BAR_HEIGHTS.map((height, i) => (
        <span
          key={i}
          style={{ animationDelay: `${i * -260}ms` }}
          className={cn(
            'w-1.5 origin-bottom rounded-full bg-current',
            height,
            // tw-animate-css 往复起伏：交替方向无限循环，负延迟错峰
            'animate-in slide-in-from-bottom-10 fill-mode-both direction-alternate',
            'repeat-infinite animation-duration-1400',
            '[--tw-ease:cubic-bezier(0.45,0,0.55,1)]',
            'motion-reduce:[animation:none]',
          )}
        />
      ))}
    </div>
  );
}

/**
 * 品牌声波徽标：紫→品红渐变圆角块 + 声波图标，登录卡与页头共用，
 * 是全站统一的「语音助手」识别符号
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30',
        className,
      )}
    >
      <AudioLinesIcon />
    </div>
  );
}

/** 内联声波 SVG，避免 BrandMark 反向依赖 lucide 命名冲突 */
function AudioLinesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className="size-1/2"
    >
      <path d="M2 10v3" />
      <path d="M6 6v11" />
      <path d="M10 3v18" />
      <path d="M14 8v7" />
      <path d="M18 5v13" />
      <path d="M22 10v3" />
    </svg>
  );
}

/**
 * 全页氛围层（登录/见面页居中卡片的舞台）：神经网格 + 光斑 + 声波环 +
 * 悬浮图标。语义元素藏于 aria-hidden 层，不参与交互与无障碍树
 */
export function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* 神经网格：中心向四周淡出 */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_45%,black_30%,transparent_75%)]" />
      {/* 光斑：紫/青渐变暗示 AI 氛围 */}
      <div className="absolute -top-24 -left-24 size-96 rounded-full bg-violet-400/25 blur-3xl" />
      <div className="absolute top-1/3 -right-28 size-80 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="absolute -bottom-32 left-1/4 size-96 rounded-full bg-fuchsia-400/15 blur-3xl" />
      {/* 声波环：卡片后方的同心圆，隐喻语音扩散；中环缓慢呼吸 */}
      <div className="absolute top-1/2 left-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2">
        <div className="size-full rounded-full border border-ring/15" />
        <div className="absolute inset-[-3rem] animate-in zoom-in-95 fade-in-50 fill-mode-both direction-alternate repeat-infinite animation-duration-6000 [--tw-ease:cubic-bezier(0.45,0,0.55,1)] rounded-full border border-ring/10 motion-reduce:[animation:none]" />
        <div className="absolute inset-[-6rem] rounded-full border border-ring/5" />
      </div>
      {/* 悬浮图标：语音助手元素，往复漂浮、负延迟错峰 */}
      <Mic className="absolute top-[14%] left-[16%] size-8 animate-in slide-in-from-bottom-4 fill-mode-both direction-alternate repeat-infinite animation-duration-8000 delay-[-1.5s] [--tw-ease:cubic-bezier(0.45,0,0.55,1)] text-primary/20 motion-reduce:[animation:none]" />
      <AudioLines className="absolute top-[18%] right-[12%] size-12 animate-in slide-in-from-bottom-4 fill-mode-both direction-alternate repeat-infinite animation-duration-7000 [--tw-ease:cubic-bezier(0.45,0,0.55,1)] text-primary/15 motion-reduce:[animation:none]" />
      <Bot className="absolute bottom-[16%] left-[10%] size-14 animate-in slide-in-from-bottom-4 fill-mode-both direction-alternate repeat-infinite animation-duration-9000 delay-[-3s] [--tw-ease:cubic-bezier(0.45,0,0.55,1)] text-foreground/15 motion-reduce:[animation:none]" />
      <Sparkles className="absolute right-[18%] bottom-[20%] size-9 animate-in slide-in-from-bottom-4 fill-mode-both direction-alternate repeat-infinite animation-duration-10000 delay-[-5s] [--tw-ease:cubic-bezier(0.45,0,0.55,1)] text-foreground/10 motion-reduce:[animation:none]" />
    </div>
  );
}

/**
 * 内容页氛围层（设备列表等长页面的克制品）：固定定位随视口，
 * 光斑与网格透明度压低，不与内容抢注意力
 */
export function PageGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_10%,transparent_70%)]" />
      <div className="absolute -top-32 -left-24 size-96 rounded-full bg-violet-400/15 blur-3xl" />
      <div className="absolute top-1/2 -right-32 size-96 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute -bottom-40 left-1/3 size-96 rounded-full bg-fuchsia-400/10 blur-3xl" />
    </div>
  );
}
