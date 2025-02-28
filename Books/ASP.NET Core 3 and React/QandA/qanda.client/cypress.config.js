import { defineConfig } from 'cypress';
import 'dotenv/config';

export default defineConfig({
  e2e: {
    baseUrl: 'https://localhost:7120',
    chromeWebSecurity: false,
  },
  env: {
    auth0_username: process.env.VITE_AUTH0_USERNAME,
    auth0_password: process.env.VITE_AUTH0_PASSWORD,
    auth0_domain: process.env.VITE_AUTH_DOMAIN,
    auth0_audience: process.env.VITE_AUTH0_AUDIENCE,
    auth0_scope: process.env.VITE_AUTH0_SCOPE,
    auth0_client_id: process.env.VITE_AUTH_CLIENT,
    auth0_client_secret: process.env.VITE_AUTH0_CLIENT_SECRET,
  },
});
