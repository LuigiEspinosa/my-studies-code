import { Fragment, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../redux/store/store';
import { matchPath, useLocation } from 'react-router-dom';
import {
  clearPostedAnswer,
  fetchQuestion,
  postAnswerThunk,
} from '../../redux/slice/questionsSlice';
import {
  Form,
  minLength,
  required,
  SubmitResult,
  Values,
} from '../../components/Form';
import { Page } from '../Page';
import styled from '@emotion/styled';
import { gray3, gray6 } from '../../Styles';
import { AnswerList } from '../../components/Answers/AnswerList';
import { Field } from '../../components/Form/Field';

export const QuestionPage = () => {
  const { pathname } = useLocation();

  const dispath = useDispatch<AppDispatch>();
  const { viewing, loading, postedAnswerResult } = useSelector(
    (state: RootState) => state.questions,
  );

  useEffect(() => {
    const match = matchPath('/questions/:questionId', pathname);

    if (match && match.params['questionId']) {
      const questionId = Number(match.params['questionId']);
      dispath(fetchQuestion(questionId));
    }

    return function cleanUp() {
      clearPostedAnswer();
    };
  }, [pathname, fetchQuestion, clearPostedAnswer]);

  const handleSubmit = (values: Values) => {
    dispath(
      postAnswerThunk({
        questionId: viewing!.questionId,
        content: values.content,
        userName: 'Fred',
        created: new Date(),
      }),
    );
  };

  let submitResult: SubmitResult | undefined;
  if (postedAnswerResult)
    submitResult = { success: postedAnswerResult !== undefined };

  return (
    <Page>
      <Container>
        <Title>
          {viewing === null ? (loading ? 'Loading...' : '') : viewing?.title}
        </Title>

        {viewing !== null && (
          <Fragment>
            <Content>{viewing?.content}</Content>

            <UserName>
              {`Asked by ${viewing.userName} on
                ${viewing.created.toLocaleDateString()} 
                ${viewing.created.toLocaleTimeString()}`}
            </UserName>

            <AnswerList data={viewing.answers} />

            <FormContainer>
              <Form
                submitCaption="Submit Your Answer"
                validationRules={{
                  content: [
                    { validator: required },
                    { validator: minLength, arg: 50 },
                  ],
                }}
                onSubmit={handleSubmit}
                submitResult={submitResult}
                failureMessage="There was a problem with your answer"
                successMessage="Your answer was successfully submitted"
              >
                <Field name="content" label="Your Answer" type="TextArea" />
              </Form>
            </FormContainer>
          </Fragment>
        )}
      </Container>
    </Page>
  );
};

const Container = styled.div`
  background-color: #fff;
  padding: 15px 20px 20px 20px;
  border-radius: 4px;
  border: 1px solid ${gray6};
  box-shadow: 0 3px 5px 0 rgba(0, 0, 0, 0.16);
`;

const Title = styled.div`
  font-size: 19px;
  font-weight: bold;
  margin: 10px 0px 5px;
`;

const Content = styled.p`
  margin-top: 0px;
  background-color: #fff;
`;

const UserName = styled.div`
  font-size: 12px;
  font-style: italic;
  color: ${gray3};
`;

const FormContainer = styled.div`
  margin-top: 20px;
`;
