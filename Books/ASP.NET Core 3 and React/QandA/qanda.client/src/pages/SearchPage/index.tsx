import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../redux/store/store';
import { searchQuestionsThunk } from '../../redux/slice/questionsSlice';
import { Page } from '../Page';
import styled from '@emotion/styled';
import { QuestionList } from '../../components/Questions/QuestionList';

export const SearchPage = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const search = searchParams.get('criteria') || '';

  const dispatch = useDispatch<AppDispatch>();
  const { searched } = useSelector((state: RootState) => state.questions);

  const [isMounted, setIsMounted] = useState<boolean>(true);

  useEffect(() => {
    setIsMounted(true);

    if (search && isMounted) {
      dispatch(searchQuestionsThunk(search));
    }

    return () => {
      setIsMounted(false);
    };
  }, [search, dispatch, isMounted]);

  return (
    <Page title="Searcg Results">
      {search && <Search>for "{search}"</Search>}
      <QuestionList data={searched || []} />
    </Page>
  );
};

const Search = styled.p`
  font-size: 16px;
  font-style: italic;
  margin-top: 0px;
`;
