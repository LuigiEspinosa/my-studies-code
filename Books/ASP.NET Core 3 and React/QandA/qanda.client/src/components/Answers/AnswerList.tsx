import { FC } from 'react';
import styled from '@emotion/styled';
import { gray5 } from '../../Styles';
import { AnswerData } from '../../lib/QuestionsData';
import { Answer } from './Answer';

interface IAnswerList {
  data: AnswerData[];
}

export const AnswerList: FC<IAnswerList> = ({ data }) => {
  return (
    <List>
      {data.map((answer) => (
        <ListItem key={answer.answerId}>
          <Answer data={answer} />
        </ListItem>
      ))}
    </List>
  );
};

const List = styled.ul`
  list-style: none;
  margin: 10px 0 0 0;
  padding: 0;
`;

const ListItem = styled.li`
  border-top: 1px solid ${gray5};
`;
