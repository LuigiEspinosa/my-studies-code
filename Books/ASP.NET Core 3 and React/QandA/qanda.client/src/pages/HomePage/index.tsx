import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../Page';
import styled from '@emotion/styled';
import { PageTitle } from '../PageTitle';
import { PrimaryButton } from '../../Styles';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../redux/store/store';
import { fetchUnansweredQuestions } from '../../redux/slice/questionsSlice';
import { QuestionList } from '../../components/Questions/QuestionList';

export const HomePage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const { unanswered, loading } = useSelector(
    (state: RootState) => state.questions,
  );

  useEffect(() => {
    if (unanswered === null) dispatch(fetchUnansweredQuestions());
  }, [unanswered, fetchUnansweredQuestions]);

  const handleAskQuestionClick = () => {
    navigate('/ask');
  };

  return (
    <Page>
      <Header>
        <PageTitle>Unanswered Questions</PageTitle>
        <PrimaryButton onClick={handleAskQuestionClick}>
          Ask a Question
        </PrimaryButton>
      </Header>

      {loading ? (
        <Loading>Loading...</Loading>
      ) : (
        <QuestionList data={unanswered || []} />
      )}
    </Page>
  );
};

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Loading = styled.div`
  font-size: 16px;
  font-style: italic;
`;
