import { FC } from 'react';
import styled from '@emotion/styled';
import { AnswerData } from '../../lib/QuestionsData';
import { gray3 } from '../../Styles';

interface IAnswer {
  data: AnswerData;
}

export const Answer: FC<IAnswer> = ({ data }) => {
  return (
    <Container>
      <Content>{data.content}</Content>

      <UserName>
        {`Answered by ${data.userName} on
          ${data.created.toLocaleDateString()} 
          ${data.created.toLocaleTimeString()}`}
      </UserName>
    </Container>
  );
};

const Container = styled.div`
  padding: 10px 0px;
`;

const Content = styled.div`
  padding: 10px 0px;
  font-size: 13px;
`;

const UserName = styled.div`
  font-size: 12px;
  font-style: italic;
  color: ${gray3};
`;
