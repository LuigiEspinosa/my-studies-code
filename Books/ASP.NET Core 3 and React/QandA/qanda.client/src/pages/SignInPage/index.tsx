import { FC, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Page } from '../Page';
import { StatusText } from '../../Styles';

type SigninAction = 'signin' | 'signin-callback';

interface Props {
  action: SigninAction;
}

export const SignInPage: FC<Props> = ({ action }) => {
  const { loginWithRedirect } = useAuth0();

  useEffect(() => {
    const handleLogin = async () => {
      if (action === 'signin') {
        await loginWithRedirect({
          appState: {
            returnTo: '/',
          },
        });
      }
    };

    handleLogin();
  }, []);

  return (
    <Page title="Sign In">
      <StatusText>Signing in...</StatusText>
    </Page>
  );
};
