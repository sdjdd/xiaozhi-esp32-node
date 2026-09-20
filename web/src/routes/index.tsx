import type { ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  CircuitBoard,
  Ear,
  Mic,
  Radio,
  Sparkles,
  Subtitles,
  UserRound,
  Volume2,
  Waves,
  Zap,
} from 'lucide-react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { TOKEN_KEY } from '@/api/client';
import { Backdrop, BrandMark, PageGlow, VoiceBars } from '@/components/ambient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from 'cn';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

/** 能力清单：中性描述「全双工语音对话」这一类能力的共性，不指向具体产品 */
const FEATURES = [
  {
    icon: Waves,
    title: '全双工对话',
    desc: '开口即可打断：新一轮开始，上一轮的生成与播放立即让位，不残留也不串音。',
  },
  {
    icon: Zap,
    title: '流式低延迟',
    desc: '语音活动检测切段之后，识别、生成与合成逐段推进，边说边出声。',
  },
  {
    icon: UserRound,
    title: '性格与音色',
    desc: '每台设备认领一位伙伴，可设定性格、挑选音色，并在选择前直接试听。',
  },
  {
    icon: Radio,
    title: '实时在线状态',
    desc: '设备连接即登记在线，控制台实时可见，在线离线一目了然。',
  },
  {
    icon: Subtitles,
    title: '音频与字幕同步',
    desc: '下行音频帧与字幕按播放进度派发，听与看始终对齐。',
  },
  {
    icon: CircuitBoard,
    title: '接入可替换',
    desc: '识别、合成与生成各自独立接入，可按需替换所依赖的服务。',
  },
] as const;

/** 对话的三个阶段：听、想、说 */
const PIPELINE = [
  {
    step: '01',
    icon: Ear,
    title: '听',
    desc: '设备上行音频，经语音活动检测切出每一段话，再流式转写为文字。',
  },
  {
    step: '02',
    icon: Sparkles,
    title: '想',
    desc: '把对话历史与伙伴的性格一起交给模型，流式生成这一轮的回复。',
  },
  {
    step: '03',
    icon: Volume2,
    title: '说',
    desc: '回复逐句合成为音频，连同字幕按播放进度下发给设备。',
  },
] as const;

const CONSOLE_POINTS = [
  '用激活码把设备绑定为伙伴，解绑即释放',
  '设定伙伴的名字、性格与音色',
  '实时查看每台设备的在线状态',
  '管理员维护预设角色与音色清单',
] as const;

function LandingPage() {
  const authed = localStorage.getItem(TOKEN_KEY) !== null;
  const consoleTo: '/devices' | '/login' = authed ? '/devices' : '/login';
  const consoleLabel = authed ? '进入控制台' : '登录 / 注册';

  return (
    <div className="min-h-svh">
      <PageGlow />

      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark className="size-9" />
            <span className="font-semibold text-lg tracking-tight">
              语音助手
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <a
              href="#features"
              className="rounded-lg px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              能力
            </a>
            <a
              href="#how"
              className="rounded-lg px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              工作原理
            </a>
            <a
              href="#console"
              className="rounded-lg px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              控制台
            </a>
          </nav>
          <Button
            size="lg"
            className="h-10 px-5"
            render={<Link to={consoleTo} />}
          >
            {consoleLabel}
            <ArrowRight />
          </Button>
        </div>
      </header>

      <main>
        {/* 首屏：左文案 + 右对话面板，全页氛围层只在此处铺开 */}
        <section className="relative overflow-hidden border-b border-border/60">
          <Backdrop />
          <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-16 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
            <div className="space-y-8">
              <Badge
                variant="secondary"
                className="h-7 gap-2 rounded-full px-3 text-[0.8rem] animate-in fade-in slide-in-from-bottom-2 fill-mode-both animation-duration-500 motion-reduce:[animation:none]"
              >
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 opacity-70 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                全双工 · 实时语音对话
              </Badge>
              <h1 className="text-balance font-bold text-4xl leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl animate-in fade-in slide-in-from-bottom-3 fill-mode-both animation-duration-700 delay-75 motion-reduce:[animation:none]">
                实时
                <span className="bg-linear-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
                  全双工
                </span>
                的语音对话
              </h1>
              <p className="max-w-xl text-balance text-lg leading-relaxed text-muted-foreground animate-in fade-in slide-in-from-bottom-3 fill-mode-both animation-duration-700 delay-150 motion-reduce:[animation:none]">
                设备采集音频上行，服务端完成语音活动检测、流式识别、模型生成与
                流式合成，再把声音与字幕送回设备。开口即可打断，回应几乎无等待。
              </p>
              <div className="flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-bottom-3 fill-mode-both animation-duration-700 delay-200 motion-reduce:[animation:none]">
                <Button
                  size="lg"
                  className="h-11 px-6 text-base"
                  render={<Link to={consoleTo} />}
                >
                  {consoleLabel}
                  <ArrowRight />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 px-6 text-base"
                  render={<a href="#how" />}
                >
                  了解工作原理
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground text-sm animate-in fade-in fill-mode-both animation-duration-700 delay-300 motion-reduce:[animation:none]">
                {['逐段流式下发', '可随时打断', '音频字幕同步'].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <HeroPanel />
          </div>
        </section>

        {/* 能力：六项卡片 */}
        <section
          id="features"
          className="scroll-mt-24 border-b border-border/60 bg-muted/30"
        >
          <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
            <SectionHeading
              eyebrow="能力"
              title="围绕对话本身的每一环"
              desc="不做多余的事，把实时语音对话的每个环节打磨顺畅。"
            />
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <Card
                  key={title}
                  className="h-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-primary/30"
                >
                  <CardHeader className="gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-linear-to-br from-violet-500/15 to-fuchsia-500/15 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <CardTitle className="text-lg">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* 工作原理：听、想、说三步 */}
        <section id="how" className="scroll-mt-24 border-b border-border/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
            <SectionHeading
              eyebrow="工作原理"
              title="一轮对话，只做三件事"
              desc="从声音到文字，再回到声音，每一步都流式推进。"
            />
            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {PIPELINE.map(({ step, icon: Icon, title, desc }) => (
                <div
                  key={step}
                  className="relative flex flex-col gap-5 rounded-2xl border border-border/70 bg-card p-7 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="font-bold text-4xl text-muted-foreground/25 tabular-nums">
                      {step}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-heading font-semibold text-xl">
                      {title}
                    </h3>
                    <p className="leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-muted-foreground text-sm">
              每一环都支持中断：新一句话开始，上一轮的生成与播放立即让位。
            </p>
          </div>
        </section>

        {/* 控制台：引导进控制台 */}
        <section id="console" className="scroll-mt-24">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
            <Card className="relative overflow-hidden bg-card/80 px-2 py-2">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-linear-to-br from-violet-500/20 to-fuchsia-500/10 blur-3xl"
              />
              <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="space-y-6">
                  <Eyebrow trailingOnly>控制台</Eyebrow>
                  <h2 className="font-bold text-3xl tracking-tight sm:text-4xl">
                    一个控制台，管好每台设备
                  </h2>
                  <p className="max-w-xl leading-relaxed text-muted-foreground">
                    把设备绑定为伙伴，设置它说话的样子；设备是否在线、绑在谁名下，
                    都在同一处看清。
                  </p>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {CONSOLE_POINTS.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span className="text-muted-foreground">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  size="lg"
                  className="h-11 self-start px-6 text-base lg:self-center"
                  render={<Link to={consoleTo} />}
                >
                  {consoleLabel}
                  <ArrowRight />
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <div className="flex items-center gap-3">
            <BrandMark className="size-8" />
            <div className="leading-tight">
              <p className="font-semibold text-sm">语音助手</p>
              <p className="text-muted-foreground text-xs">
                实时全双工语音对话
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-muted-foreground text-sm">
            <a
              href="#features"
              className="transition-colors hover:text-foreground"
            >
              能力
            </a>
            <a href="#how" className="transition-colors hover:text-foreground">
              工作原理
            </a>
            <Link
              to={consoleTo}
              className="transition-colors hover:text-foreground"
            >
              {consoleLabel}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** 区块眉标：细渐变横线 + 小字，居中或仅保留尾线（左对齐区块） */
function Eyebrow({
  children,
  trailingOnly = false,
  className,
}: {
  children: ReactNode;
  trailingOnly?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-3 text-primary', className)}
    >
      {!trailingOnly && (
        <span
          aria-hidden
          className="h-px w-8 bg-linear-to-r from-transparent to-primary/50"
        />
      )}
      <span className="font-medium text-xs tracking-[0.2em]">{children}</span>
      <span
        aria-hidden
        className="h-px w-8 bg-linear-to-r from-primary/50 to-transparent"
      />
    </span>
  );
}

/** 区块标题：眉标 + 标题 + 说明，居中对齐 */
function SectionHeading({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-5 font-bold text-3xl tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-balance leading-relaxed text-muted-foreground">
        {desc}
      </p>
    </div>
  );
}

/** 首屏右侧的对话面板：装饰性 mock，示意一轮问答与流式光标 */
function HeroPanel() {
  return (
    <div className="relative mx-auto w-full max-w-md animate-in fade-in slide-in-from-bottom-6 fill-mode-both animation-duration-700 delay-200 motion-reduce:[animation:none]">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-linear-to-br from-violet-500/20 via-fuchsia-500/10 to-cyan-400/10 blur-2xl"
      />
      <Card className="relative gap-0 py-0 shadow-2xl shadow-primary/10">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
            </span>
            <span className="font-medium text-sm">正在对话</span>
          </div>
          <VoiceBars className="text-primary/60" />
        </div>
        <div className="grid gap-4 p-5">
          <ChatBubble side="user">今天天气怎么样？</ChatBubble>
          <ChatBubble side="assistant">
            我看了一下，今天多云转晴，风不大，出门带件外套就刚好。
          </ChatBubble>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-5 py-3 text-muted-foreground text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Mic className="size-3.5" />
            上行音频
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Volume2 className="size-3.5" />
            下行音频 · 字幕
          </span>
        </div>
      </Card>
      {/* 悬浮小卡：补一句「流式」，与声波条呼应 */}
      <div className="absolute -bottom-5 -left-5 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-lg shadow-primary/10 backdrop-blur">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Zap className="size-4" />
        </span>
        <div className="leading-tight">
          <p className="font-semibold text-sm">逐段流式</p>
          <p className="text-muted-foreground text-xs">边说边出声</p>
        </div>
      </div>
    </div>
  );
}

/** 对话气泡：用户侧靠右填色，助手侧靠左浅底并带流式光标 */
function ChatBubble({
  side,
  children,
}: {
  side: 'user' | 'assistant';
  children: ReactNode;
}) {
  const isUser = side === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md bg-muted text-foreground',
        )}
      >
        {children}
        {!isUser && (
          <span className="ml-1 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-primary align-middle motion-reduce:animate-none" />
        )}
      </div>
    </div>
  );
}
