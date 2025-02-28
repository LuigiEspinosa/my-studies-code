export const server =
  process.env.REACT_APP_ENV === 'production'
    ? 'https://qanda-backend.azurewebsites.net'
    : 'http://localhost:7119';

export const webAPIUrl = `${server}/api`;

export const authSettings = {
  domain: import.meta.env.VITE_AUTH_DOMAIN || '',
  clientId: import.meta.env.VITE_AUTH_CLIENT || '',
  authorizationParams: {
    audience: import.meta.env.VITE_AUTH0_AUDIENCE || '',
    redirect_uri: window.location.origin + '/signin-callback',
    scope: import.meta.env.VITE_AUTH0_SCOPE || '',
  },
};
