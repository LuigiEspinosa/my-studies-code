import { FC } from 'react';
import { QuestionData } from '../../lib/QuestionsData';
import styled from '@emotion/styled';
import { accent2, gray5 } from '../../Styles';
import { Question } from './Question';

interface IQuestionList {
  data: QuestionData[];
  renderItem?: (item: QuestionData) => JSX.Element;
}

export const QuestionList: FC<IQuestionList> = ({ data, renderItem }) => {
  return (
    <ListContainer>
      {data.map((question) => (
        <ListItem key={question.questionId}>
          {renderItem ? renderItem(question) : <Question data={question} />}
        </ListItem>
      ))}
    </ListContainer>
  );
};

const ListContainer = styled.ul`
  list-style: none;
  margin: 10px 0 0 0;
  padding: 0px 20px;
  background-color: #fff;
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  border-top: 3px solid ${accent2};
  box-shadow: 0 3px 5px 0 rgba(0, 0, 0, 0.16);
`;

const ListItem = styled.li`
  border-top: 1px solid ${gray5};

  :first-of-type {
    border-top: none;
  }
`;
