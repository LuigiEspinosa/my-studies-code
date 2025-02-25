import { FC, Fragment, ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Page } from '../Page';

interface IAuthorizedPage {
  children: ReactNode;
}

export const AuthorizedPage: FC<IAuthorizedPage> = ({ children }) => {
  const { isAuthenticated } = useAuth0();

  if (isAuthenticated) {
    return <Fragment>{children}</Fragment>;
  } else {
    return <Page title="You don't have access to this page!" />;
  }
};
