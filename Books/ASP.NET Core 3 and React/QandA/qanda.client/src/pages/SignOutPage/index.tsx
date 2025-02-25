import { FC } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Page } from '../Page';
import { StatusText } from '../../Styles';

type SignoutAction = 'signout' | 'signout-callback';

interface Props {
  action: SignoutAction;
}

export const SignOutPage: FC<Props> = ({ action }) => {
  let message = 'Signing out ...';

  const { logout } = useAuth0();

  switch (action) {
    case 'signout':
      logout({
        logoutParams: {
          returnTo: window.location.origin + '/signout-callback',
        },
      });
      break;
    case 'signout-callback':
      message = 'You successfully signed out!';
      break;
  }

  return (
    <Page title="Sign Out">
      <StatusText>{message}</StatusText>
    </Page>
  );
};
