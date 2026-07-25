import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';

// Sin @azure/msal-react a propósito: v5 exige React >= 19.2.1 y este frontend es
// React 18.3. state.tsx ya es el provider central — MsalProvider no aportaría nada.
const pca = new PublicClientApplication({
  auth: {
    clientId: import.meta.env.VITE_ENTRA_SPA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: `${window.location.origin}/redirect.html`, // el puente COOP, no la home
  },
  cache: { cacheLocation: 'sessionStorage' },
});

// Un token sirve para UN recurso: solo el scope del API propio.
// Nunca scopes de Microsoft Graph: sus tokens son de formato propietario y el
// backend no puede validarlos.
const API_SCOPE = import.meta.env.VITE_API_SCOPE;

export async function initAuth(): Promise<AccountInfo | null> {
  await pca.initialize();
  const res = await pca.handleRedirectPromise({ navigateToLoginRequestUrl: true });
  const account = res?.account ?? pca.getAllAccounts()[0] ?? null;
  if (account) pca.setActiveAccount(account);
  return account;
}

export const login = () => pca.loginRedirect({ scopes: [API_SCOPE] });
export const logout = () => pca.logoutRedirect();

export async function getToken(): Promise<string> {
  try {
    const r = await pca.acquireTokenSilent({ scopes: [API_SCOPE] });
    return r.accessToken;
  } catch (e) {
    // v5: e.message es un enlace a la doc — ramificar SIEMPRE por errorCode.
    const code = (e as { errorCode?: string })?.errorCode;
    if (code === 'interaction_required' || code === 'login_required') {
      await pca.acquireTokenRedirect({ scopes: [API_SCOPE] });
    }
    throw e;
  }
}
