/** 音色清单域 HTTP E2E：列表对所有登录用户开放，增删改仅管理员 */
import { describe, expect, it } from 'vitest';
import { VOICE_PRESETS } from '@/services/voice';
import { api, json, newAdmin, newUser, withToken } from './helpers';

interface VoiceView {
  id: number;
  name: string;
  voice: string;
  previewUrl: string | null;
}

describe('voices', () => {
  it('无凭证 401', async () => {
    expect((await api('/api/voices')).status).toBe(401);
  });

  it('带凭证返回全部预置音色，顺序即预置顺序', async () => {
    const { token } = await newUser();
    const res = await api('/api/voices', withToken(token));
    expect(res.status).toBe(200);

    const arr = (await res.json()) as VoiceView[];
    expect(arr).toHaveLength(VOICE_PRESETS.length);
    expect(arr.map((v) => v.voice)).toEqual(VOICE_PRESETS.map((v) => v.voice));
    expect(arr[0].name).toEqual(VOICE_PRESETS[0].name);
    expect(arr[0].previewUrl).toEqual(VOICE_PRESETS[0].previewUrl);
  });

  it('普通用户创建音色 403', async () => {
    const { token } = await newUser();
    const res = await api(
      '/api/voices',
      json({ name: '越权音色', voice: 'zh_male_x' }, withToken(token)),
    );
    expect(res.status).toBe(403);
  });

  it('管理员增删改全流程（撞名/撞代码均 409）', async () => {
    const { token } = await newAdmin();

    const created = await api(
      '/api/voices',
      json(
        {
          name: 'E2E 音色甲',
          voice: 'zh_male_e2e_a',
          previewUrl: 'https://cdn.example.com/a.mp3',
        },
        withToken(token),
      ),
    );
    expect(created.status).toBe(201);
    const voice = (await created.json()) as VoiceView;
    expect(voice).toMatchObject({
      name: 'E2E 音色甲',
      voice: 'zh_male_e2e_a',
      previewUrl: 'https://cdn.example.com/a.mp3',
    });

    // 撞展示名
    const dupName = await api(
      '/api/voices',
      json({ name: 'E2E 音色甲', voice: 'zh_male_e2e_b' }, withToken(token)),
    );
    expect(dupName.status).toBe(409);

    // 撞音色代码
    const dupCode = await api(
      '/api/voices',
      json({ name: 'E2E 音色乙', voice: 'zh_male_e2e_a' }, withToken(token)),
    );
    expect(dupCode.status).toBe(409);

    // PATCH 改展示名生效
    const patched = await api(
      `/api/voices/${voice.id}`,
      json({ name: 'E2E 音色甲改' }, withToken(token, { method: 'PATCH' })),
    );
    expect(patched.status).toBe(200);
    let list = await listVoices(token);
    expect(list.find((v) => v.id === voice.id)?.name).toBe('E2E 音色甲改');

    // PATCH 改试听地址生效，传 null 清除
    await api(
      `/api/voices/${voice.id}`,
      json(
        { previewUrl: 'https://cdn.example.com/b.mp3' },
        withToken(token, { method: 'PATCH' }),
      ),
    );
    list = await listVoices(token);
    expect(list.find((v) => v.id === voice.id)?.previewUrl).toBe(
      'https://cdn.example.com/b.mp3',
    );
    await api(
      `/api/voices/${voice.id}`,
      json({ previewUrl: null }, withToken(token, { method: 'PATCH' })),
    );
    list = await listVoices(token);
    expect(list.find((v) => v.id === voice.id)?.previewUrl).toBeNull();

    // 删除后列表消失，再删 404
    const del = await api(
      `/api/voices/${voice.id}`,
      withToken(token, { method: 'DELETE' }),
    );
    expect(del.status).toBe(200);
    const afterDel = await listVoices(token);
    expect(afterDel.find((v) => v.id === voice.id)).toBeUndefined();
    const delAgain = await api(
      `/api/voices/${voice.id}`,
      withToken(token, { method: 'DELETE' }),
    );
    expect(delAgain.status).toBe(404);
  });

  it('非法试听地址 400', async () => {
    const { token } = await newAdmin();
    const invalid = await api(
      '/api/voices',
      json(
        { name: 'E2E 音色丙', voice: 'zh_male_e2e_c', previewUrl: 'not-a-url' },
        withToken(token),
      ),
    );
    expect(invalid.status).toBe(400);
  });

  it('空名/空代码 400；空补丁视为空操作直接成功', async () => {
    const { token } = await newAdmin();
    const emptyName = await api(
      '/api/voices',
      json({ name: '', voice: 'zh_male_x' }, withToken(token)),
    );
    expect(emptyName.status).toBe(400);
    const emptyVoice = await api(
      '/api/voices',
      json({ name: 'x', voice: '' }, withToken(token)),
    );
    expect(emptyVoice.status).toBe(400);
    const emptyPatch = await api(
      '/api/voices/1',
      json({}, withToken(token, { method: 'PATCH' })),
    );
    expect(emptyPatch.status).toBe(200);
    expect(await emptyPatch.json()).toEqual({ ok: true });
  });
});

async function listVoices(token: string): Promise<VoiceView[]> {
  const res = await api('/api/voices', withToken(token));
  expect(res.status).toBe(200);
  return (await res.json()) as VoiceView[];
}
