import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { eq } from 'drizzle-orm';
import { Agent } from '@/agent/agent';
import { db, agents, devices } from '@/database';
import { TempMemory } from '@/memory/temp-memory';
import { VolcengineSTT } from '@/providers/stt/volcengine';
import { VolcengineTTS } from '@/providers/tts/volcengine';
import { DeviceService } from './device';

/** 语音硬约束：无论角色如何配置都必须满足，不交给用户配置覆盖 */
const BASE_INSTRUCTIONS = `你是一个友好的语音助手，你的回复会被语音合成后朗读给用户听。

要求：
- 只输出可以朗读的口语内容，不要输出任何无法朗读的内容：禁止 Markdown、列表、代码、表格、链接、emoji 和特殊符号
- 除非用户明确要求详细说明，否则回复尽可能简洁，不啰嗦、不重复、不加无意义的开场白和客套话
- 语气自然友好，像面对面聊天一样说话`;

/**
 * 语音 Agent 服务：共享 STT/TTS Provider，按设备装配会话，
 * 并解析设备 1:1 伙伴（名字 + 性格提示词）。
 * 预设角色清单由 PersonaService 维护，本服务只消费伙伴行里的最终 system_prompt
 */
export class AgentService {
  /** 所有 Agent 共享的语音 Provider；TTS 内部以连接池支撑并发 */
  private stt = new VolcengineSTT({
    baseURL: process.env.VOLC_STT_BASE_URL!,
    apiKey: process.env.VOLC_API_KEY!,
    resourceId: process.env.VOLC_STT_MODEL!,
  });

  private tts = new VolcengineTTS({
    baseURL: process.env.VOLC_TTS_BASE_URL!,
    apiKey: process.env.VOLC_API_KEY!,
    resourceId: process.env.VOLC_TTS_MODEL!,
  });

  private provider = createOpenAICompatible({
    name: 'custom',
    baseURL: process.env.VOLC_BASE_URL!,
    apiKey: process.env.VOLC_API_KEY!,
  });

  constructor(private deviceService: DeviceService) {}

  async createAgent({
    clientId,
    deviceId,
    sessionId,
  }: {
    /** client-id 头（xiaozhi 固件的 UUID v4），身份锚点 */
    clientId: string;
    /** device-id 头（MAC），仅展示/关联 */
    deviceId: string;
    /** gateway 生成的会话 uuid */
    sessionId: string;
  }) {
    // 身份解析即登记：DB 故障在 hello 阶段 fail-fast，
    // 避免设备以为在线却拿不到历史
    const device = await this.deviceService.ensureDevice(clientId, deviceId);

    // 伙伴名字、性格与音色在会话建立时读取一次，改配置后下一轮会话/重连生效
    const companion = await this.findCompanionForDevice(device.id);
    const instructions = `${BASE_INSTRUCTIONS}

# 你的名字
用户给你起了名字，你叫「${companion.name}」，被问到你是谁时用这个名字自称。

# 你的角色
${companion.system_prompt}`;

    return new Agent({
      model: this.provider(process.env.VOLC_MODEL!),
      instructions,
      voice: companion.voice,
      memory: new TempMemory(device.id, sessionId),
      stt: this.stt,
      tts: this.tts,
    });
  }

  /** 设备 1:1 伙伴的名字、性格提示词与音色；认领即建伙伴，缺失属数据异常 fail-fast */
  private async findCompanionForDevice(did: number): Promise<{
    name: string;
    system_prompt: string;
    voice: string;
  }> {
    const [row] = await db
      .select({
        name: agents.name,
        system_prompt: agents.system_prompt,
        voice: agents.voice,
      })
      .from(agents)
      .innerJoin(devices, eq(devices.agent_id, agents.id))
      .where(eq(devices.id, did))
      .limit(1);
    if (!row) {
      throw new Error(`device ${did} has no companion`);
    }
    return row;
  }

  [Symbol.dispose]() {
    this.stt.destroy();
    this.tts.destroy();
  }
}
