import { FC, ReactNode } from 'react';
import styled from '@emotion/styled';
import { PageTitle } from './PageTitle';

interface IPage {
  title?: string;
  children?: ReactNode;
}

export const Page: FC<IPage> = ({ title, children }) => {
  return (
    <Container>
      {title && <PageTitle>{title}</PageTitle>}
      {children}
    </Container>
  );
};

const Container = styled.div`
  margin: 50px auto 20px auto;
  padding: 30px 20px;
  max-width: 600px;
`;
