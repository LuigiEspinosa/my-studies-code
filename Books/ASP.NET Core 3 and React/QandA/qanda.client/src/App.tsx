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
import { SignOutPage } from './pages/SignOutPage';
import { QuestionPage } from './pages/QuestionPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthProvider } from './components/Auth';
import { AuthorizedPage } from './pages/AuthorizedPage';

export const App = () => {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AuthProvider>
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
                    <AuthorizedPage>
                      <AskPage />
                    </AuthorizedPage>
                  </Suspense>
                }
              />
              <Route path="/signin" element={<SignInPage action="signin" />} />
              <Route
                path="/signin-callback"
                element={<SignInPage action="signin-callback" />}
              />
              <Route
                path="/signout"
                element={<SignOutPage action="signout" />}
              />
              <Route
                path="/signout-callback"
                element={<SignOutPage action="signout-callback" />}
              />
              <Route path="/questions/:questionId" element={<QuestionPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Container>
        </AuthProvider>
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
