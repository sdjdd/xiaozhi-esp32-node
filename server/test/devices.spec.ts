/**
 * 设备域 HTTP E2E（迁移自手写探针 device-flow.ts）。
 * 与探针的差别：造设备不再直插 DB，改走 OTA 握手拿真实激活码——
 * 全程 HTTP，顺带覆盖 /api/ota。
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { VOICE_PRESETS } from '@/services/voice';
import { E2E_PORT, api, json, newUser, withToken } from './helpers';

/** 随机 MAC（设备台账的展示字段） */
function randomMac(): string {
  return Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0'),
  ).join(':');
}

interface OtaResponse {
  activation?: { code: string };
  websocket?: { url: string; token: string };
}

/** OTA 握手（client-id 是身份锚点）：未激活回 activation，已激活回 websocket */
async function otaHandshake(
  clientId: string,
  mac: string,
  headers: Record<string, string> = {},
): Promise<OtaResponse> {
  const res = await api(
    '/api/ota',
    json(
      {
        application: { version: '1.0.0', elf_sha256: '0'.repeat(64) },
        board: { type: 'esp32', name: 'e2e' },
      },
      { headers: { 'client-id': clientId, 'device-id': mac, ...headers } },
    ),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as OtaResponse;
}

/** 登记一台全新未激活设备，返回身份锚点与激活码 */
async function newDevice(): Promise<{
  clientId: string;
  mac: string;
  code: string;
}> {
  const clientId = randomUUID();
  const mac = randomMac();
  const body = await otaHandshake(clientId, mac);
  expect(body.activation?.code).toMatch(/^\d{6}$/);
  return { clientId, mac, code: body.activation!.code };
}

/** 给用户绑定一台新设备，返回设备信息与内部 id */
async function bindDevice(
  token: string,
): Promise<{ dev: Awaited<ReturnType<typeof newDevice>>; id: number }> {
  const dev = await newDevice();
  const add = await api(
    '/api/devices',
    json({ code: dev.code }, withToken(token)),
  );
  expect(add.status).toBe(201);
  const { id } = (await add.json()) as { id: number };
  return { dev, id };
}

describe('设备域', () => {
  it('OTA 登记 → 激活码添加 → 默认伙伴与完整 MAC', async () => {
    const { token } = await newUser();
    const dev = await newDevice();

    const add = await api(
      '/api/devices',
      json({ code: dev.code }, withToken(token)),
    );
    expect(add.status).toBe(201);
    expect(await add.json()).toMatchObject({
      id: expect.any(Number),
      name: '新伙伴',
      online: false,
      mac: dev.mac,
      systemPrompt: expect.stringMatching(/.+/),
      // 默认伙伴音色 = 音色清单 sort 首条（globalSetup 种子）
      voice: VOICE_PRESETS[0].voice,
      createdAt: expect.any(String),
    });
  });

  it('绑定即清码：顺序重用激活码 400（409 只在并发抢占出现）', async () => {
    const { token } = await newUser();
    const { dev, id } = await bindDevice(token);
    expect(id).toBeGreaterThan(0);

    const reuse = await api(
      '/api/devices',
      json({ code: dev.code }, withToken(token)),
    );
    expect(reuse.status).toBe(400);
  });

  it('无效激活码 400（e2e 库每轮重建，随机码 1/1e6 撞码概率可忽略）', async () => {
    const { token } = await newUser();
    const unknown = await api(
      '/api/devices',
      json({ code: '000000' }, withToken(token)),
    );
    expect(unknown.status).toBe(400);
  });

  it('未认证访问设备域 401', async () => {
    expect((await api('/api/devices')).status).toBe(401);
    expect((await api('/api/devices/1')).status).toBe(401);
    expect((await api('/api/devices/1', { method: 'DELETE' })).status).toBe(
      401,
    );
  });

  it('列表与单个查询：新用户独一份', async () => {
    const { token } = await newUser();
    const { id } = await bindDevice(token);

    const list = await api('/api/devices', withToken(token));
    expect(list.status).toBe(200);
    const arr = (await list.json()) as Array<{ id: number }>;
    expect(arr.map((d) => d.id)).toEqual([id]);

    expect((await api(`/api/devices/${id}`, withToken(token))).status).toBe(
      200,
    );
  });

  it('他人设备与未知 id 一律 404（不泄露存在性）', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const { id } = await bindDevice(owner.token);

    const other = await api(`/api/devices/${id}`, withToken(stranger.token));
    expect(other.status).toBe(404);

    const unknown = await api('/api/devices/99999999', withToken(owner.token));
    expect(unknown.status).toBe(404);
  });

  it('改名与性格生效', async () => {
    const { token } = await newUser();
    const { id } = await bindDevice(token);

    const patch = await api(
      `/api/devices/${id}`,
      json(
        { name: '小安', systemPrompt: '测试性格。' },
        withToken(token, { method: 'PATCH' }),
      ),
    );
    expect(patch.status).toBe(200);

    const single = await api(`/api/devices/${id}`, withToken(token));
    expect(await single.json()).toMatchObject({
      name: '小安',
      systemPrompt: '测试性格。',
    });

    // 空补丁：空操作成功，不改动任何字段
    const noop = await api(
      `/api/devices/${id}`,
      json({}, withToken(token, { method: 'PATCH' })),
    );
    expect(noop.status).toBe(200);
    expect(await noop.json()).toEqual({ ok: true });
  });

  it('改音色生效；清单外的音色 400', async () => {
    const { token } = await newUser();
    const { id } = await bindDevice(token);

    const other = VOICE_PRESETS[1];
    const patch = await api(
      `/api/devices/${id}`,
      json({ voice: other.voice }, withToken(token, { method: 'PATCH' })),
    );
    expect(patch.status).toBe(200);
    const single = await api(`/api/devices/${id}`, withToken(token));
    expect(await single.json()).toMatchObject({ voice: other.voice });

    const unknown = await api(
      `/api/devices/${id}`,
      json(
        { voice: 'zh_male_not_in_list' },
        withToken(token, { method: 'PATCH' }),
      ),
    );
    expect(unknown.status).toBe(400);
  });

  it('解绑 → 404 → 同 client-id 再握手回到未激活（伙伴随之销毁）', async () => {
    const { token } = await newUser();
    const { dev, id } = await bindDevice(token);

    const unbind = await api(`/api/devices/${id}`, {
      method: 'DELETE',
      ...withToken(token),
    });
    expect(unbind.status).toBe(200);
    expect((await api(`/api/devices/${id}`, withToken(token))).status).toBe(
      404,
    );

    // 伙伴销毁的行为证据：设备 user_id 已置空，OTA 重新下发激活码
    const again = await otaHandshake(dev.clientId, dev.mac);
    expect(again.activation?.code).toMatch(/^\d{6}$/);
    expect(again.websocket).toBeUndefined();
  });

  it('OTA 下发地址跟随代理协议头（X-Forwarded-Proto）', async () => {
    const { token } = await newUser();
    const { dev } = await bindDevice(token);
    const host = `127.0.0.1:${E2E_PORT}/gateway/`;

    // 直连（明文）→ ws
    expect((await otaHandshake(dev.clientId, dev.mac)).websocket?.url).toBe(
      `ws://${host}`,
    );
    // 反代声明 https（首个值生效）→ wss
    expect(
      (
        await otaHandshake(dev.clientId, dev.mac, {
          'x-forwarded-proto': 'https, http',
        })
      ).websocket?.url,
    ).toBe(`wss://${host}`);
    // 显式 http → ws
    expect(
      (
        await otaHandshake(dev.clientId, dev.mac, {
          'x-forwarded-proto': 'http',
        })
      ).websocket?.url,
    ).toBe(`ws://${host}`);
  });
});
