/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly TMDB_API: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}