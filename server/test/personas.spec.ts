/** 预设角色域 HTTP E2E：列表对所有登录用户开放，增删改仅管理员 */
import { describe, expect, it } from 'vitest';
import { PRESET_PERSONAS } from '@/services/persona';
import { api, json, newAdmin, newUser, withToken } from './helpers';

interface PersonaView {
  id: number;
  name: string;
  systemPrompt: string;
}

describe('personas', () => {
  it('无凭证 401', async () => {
    expect((await api('/api/personas')).status).toBe(401);
  });

  it('带凭证返回全部内置预设，顺序即预设顺序', async () => {
    const { token } = await newUser();
    const res = await api('/api/personas', withToken(token));
    expect(res.status).toBe(200);

    const arr = (await res.json()) as PersonaView[];
    expect(arr).toHaveLength(PRESET_PERSONAS.length);
    expect(arr.map((p) => p.name)).toEqual(PRESET_PERSONAS.map((p) => p.name));
    expect(arr[0].systemPrompt).toEqual(PRESET_PERSONAS[0].system_prompt);
  });

  it('普通用户创建预设 403', async () => {
    const { token } = await newUser();
    const res = await api(
      '/api/personas',
      json({ name: '越权预设', systemPrompt: 'x' }, withToken(token)),
    );
    expect(res.status).toBe(403);
  });

  it('管理员增删改全流程', async () => {
    const { token } = await newAdmin();

    // 创建：sort 缺省排到末尾
    const created = await api(
      '/api/personas',
      json(
        { name: 'E2E 预设甲', systemPrompt: '测试性格甲。' },
        withToken(token),
      ),
    );
    expect(created.status).toBe(201);
    const persona = (await created.json()) as PersonaView;
    expect(persona).toMatchObject({
      name: 'E2E 预设甲',
      systemPrompt: '测试性格甲。',
    });

    // 重名 409（名称即唯一事实源）
    const dup = await api(
      '/api/personas',
      json({ name: 'E2E 预设甲', systemPrompt: 'x' }, withToken(token)),
    );
    expect(dup.status).toBe(409);

    // 改名撞已有预设同样 409
    const second = await api(
      '/api/personas',
      json(
        { name: 'E2E 预设乙', systemPrompt: '测试性格乙。' },
        withToken(token),
      ),
    );
    expect(second.status).toBe(201);
    const secondView = (await second.json()) as PersonaView;
    const renameTaken = await api(
      `/api/personas/${secondView.id}`,
      json({ name: 'E2E 预设甲' }, withToken(token, { method: 'PATCH' })),
    );
    expect(renameTaken.status).toBe(409);

    // PATCH 改名与性格生效
    const patched = await api(
      `/api/personas/${persona.id}`,
      json(
        { name: 'E2E 预设甲改', systemPrompt: '测试性格甲改。' },
        withToken(token, { method: 'PATCH' }),
      ),
    );
    expect(patched.status).toBe(200);
    const afterPatch = await listNames(token);
    expect(afterPatch).toContain('E2E 预设甲改');
    expect(afterPatch).not.toContain('E2E 预设甲');

    // 删除后列表消失，再删 404
    const del = await api(
      `/api/personas/${persona.id}`,
      withToken(token, { method: 'DELETE' }),
    );
    expect(del.status).toBe(200);
    expect(await listNames(token)).not.toContain('E2E 预设甲改');
    const delAgain = await api(
      `/api/personas/${persona.id}`,
      withToken(token, { method: 'DELETE' }),
    );
    expect(delAgain.status).toBe(404);
  });

  it('空名 400；空补丁视为空操作直接成功', async () => {
    const { token } = await newAdmin();
    const emptyName = await api(
      '/api/personas',
      json({ name: '', systemPrompt: 'x' }, withToken(token)),
    );
    expect(emptyName.status).toBe(400);
    const emptyPatch = await api(
      '/api/personas/1',
      json({}, withToken(token, { method: 'PATCH' })),
    );
    expect(emptyPatch.status).toBe(200);
    expect(await emptyPatch.json()).toEqual({ ok: true });
  });
});

async function listNames(token: string): Promise<string[]> {
  const res = await api('/api/personas', withToken(token));
  expect(res.status).toBe(200);
  return ((await res.json()) as PersonaView[]).map((p) => p.name);
}
