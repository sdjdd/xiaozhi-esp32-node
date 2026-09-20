import ky from 'ky';

/** 登录凭证在 localStorage 的键名 */
export const TOKEN_KEY = 'token';

export const api = ky.create({
  prefix: '/api',
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token !== null) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      },
    ],
  },
});
