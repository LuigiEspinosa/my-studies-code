import { FC } from 'react';
import styled from '@emotion/styled';
import { QuestionData } from '../../lib/QuestionsData';
import { Link } from 'react-router-dom';
import { gray2, gray3 } from '../../Styles';

interface IQuestion {
  data: QuestionData;
  showContent?: boolean;
}

export const Question: FC<IQuestion> = ({ data, showContent = true }) => {
  const dateString = data.created.toLocaleDateString();
  const timeStrnig = data.created.toLocaleTimeString();

  return (
    <Container>
      <Title>
        <TitleLink to={`questions/${data.questionId}`}>{data.title}</TitleLink>
      </Title>

      {showContent && (
        <Content>
          {data.content.length > 50
            ? `${data.content.substring(0, 50)}`
            : data.content}
        </Content>
      )}

      <UserName>
        {`Asked by ${data.userName} on ${dateString} ${timeStrnig}`}
      </UserName>
    </Container>
  );
};

const Container = styled.div`
  padding: 10px 0px;
`;

const Title = styled.div`
  padding: 10px 0px;
  font-size: 19px;
`;

const TitleLink = styled(Link)`
  text-decoration: none;
  color: ${gray2};
`;

const Content = styled.div`
  padding-bottom: 10px;
  font-size: 15px;
  color: ${gray2};
`;

const UserName = styled.div`
  font-size: 12px;
  font-style: italic;
  color: ${gray3};
`;
