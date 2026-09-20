import { api } from './client';

export interface Credentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

export const authApi = {
  login: (body: Credentials) =>
    api.post('/auth/login', { json: body }).json<LoginResponse>(),
  register: (body: Credentials) =>
    api.post('/auth/register', { json: body }).json<{ ok: true }>(),
};
