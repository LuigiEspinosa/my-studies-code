import { Provider } from 'react-redux';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import store from './redux/store/store';

import styled from '@emotion/styled';
import { fontFamily, fontSize, gray2 } from './Styles';
import { Header } from './components/Header';

import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { Suspense } from 'react';
import { AskPage } from './pages/AskPage';
import { SignInPage } from './pages/SignInPage';
import { QuestionPage } from './pages/QuestionPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const App = () => {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <Container>
          <Header />

          <Routes>
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route
              path="/ask"
              element={
                <Suspense fallback={<Fallback>Loading...</Fallback>}>
                  <AskPage />
                </Suspense>
              }
            />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/questions/:questionId" element={<QuestionPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Container>
      </BrowserRouter>
    </Provider>
  );
};

const Container = styled.div`
  font-family: ${fontFamily};
  font-size: ${fontSize};
  color: ${gray2};
`;

const Fallback = styled.div`
  margin-top: 100px;
  text-align: center;
`;
