import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../Page';
import styled from '@emotion/styled';
import { PageTitle } from '../PageTitle';
import { PrimaryButton } from '../../Styles';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../redux/store/store';
import { fetchUnansweredQuestions } from '../../redux/slice/questionsSlice';
import { QuestionList } from '../../components/Questions/QuestionList';
import { useAuth0 } from '@auth0/auth0-react';

export const HomePage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const [isMounted, setIsMounted] = useState<boolean>(true);

  const { unanswered, loading } = useSelector(
    (state: RootState) => state.questions,
  );

  useEffect(() => {
    setIsMounted(true);
    if (unanswered === null && isMounted) dispatch(fetchUnansweredQuestions());

    return () => {
      setIsMounted(false);
    };
  }, [unanswered, dispatch, isMounted]);

  const handleAskQuestionClick = () => {
    navigate('/ask');
  };

  const { isAuthenticated } = useAuth0();

  return (
    <Page>
      <Header>
        <PageTitle>Unanswered Questions</PageTitle>

        {isAuthenticated && (
          <PrimaryButton onClick={handleAskQuestionClick}>
            Ask a Question
          </PrimaryButton>
        )}
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
