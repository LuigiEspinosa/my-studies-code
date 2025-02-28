/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_DOMAIN: string;
  readonly VITE_AUTH_CLIENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
