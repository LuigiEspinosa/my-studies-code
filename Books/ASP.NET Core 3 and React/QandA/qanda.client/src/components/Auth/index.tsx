import { FC, ReactNode } from 'react';
import { AppState, Auth0Provider } from '@auth0/auth0-react';
import { createAuth0Client } from '@auth0/auth0-spa-js';
import { authSettings } from '../../AppSettings';
import { useNavigate } from 'react-router-dom';

interface IAuthProvider {
  children: ReactNode;
}

export const getAccessToken = async () => {
  const auth0FromHook = await createAuth0Client(authSettings);
  const accessToken = await auth0FromHook.getTokenSilently();
  return accessToken;
};

export const AuthProvider: FC<IAuthProvider> = ({ children }) => {
  const navigate = useNavigate();

  const onRedirectCallback = (appState: AppState | undefined) => {
    navigate(appState?.returnTo || window.location.pathname);
  };

  return (
    <Auth0Provider
      domain={authSettings.domain}
      clientId={authSettings.clientId}
      authorizationParams={{
        redirect_uri: authSettings.authorizationParams.redirect_uri,
      }}
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  );
};
