/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Client id del app registration SPA en Entra. */
  readonly VITE_ENTRA_SPA_CLIENT_ID: string;
  /** Tenant id (dev hoy, FAVA después — solo cambia la variable). */
  readonly VITE_ENTRA_TENANT_ID: string;
  /** Scope del API propio: api://<api-client-id>/access_as_user */
  readonly VITE_API_SCOPE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
