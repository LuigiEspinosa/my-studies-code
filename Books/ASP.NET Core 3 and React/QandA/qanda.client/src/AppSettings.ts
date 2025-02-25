export const server = 'https://localhost:7119';

export const webAPIUrl = `${server}/api`;

export const authSettings = {
  domain: import.meta.env.AUTH_DOMAIN || '',
  clientId: import.meta.env.AUTH_CLIENT || '',
  authorizationParams: {
    audience: 'https://qanda',
    redirect_uri: window.location.origin + '/signin-callback',
    scope: 'OpenId profile QandAAPI email',
  },
};
