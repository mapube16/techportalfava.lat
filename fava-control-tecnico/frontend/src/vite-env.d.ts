/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Client id del app registration SPA en Entra. */
  readonly VITE_ENTRA_SPA_CLIENT_ID: string;
  /** Tenant id (dev hoy, FAVA después — solo cambia la variable). */
  readonly VITE_ENTRA_TENANT_ID: string;
  /** Scope del API propio: api://<api-client-id>/access_as_user */
  readonly VITE_API_SCOPE: string;
  /**
   * 'true' enciende el login de desarrollo temporal (Plan 01-07). Ausente en
   * cuanto exista el tenant real: es la variable que retira el formulario y el
   * aviso de la interfaz. Debe ir a la par de DEV_AUTH_ENABLED del backend.
   */
  readonly VITE_DEV_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
