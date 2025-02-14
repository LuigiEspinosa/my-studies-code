import { Fragment, useEffect, useRef, useState } from 'react';
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
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@aspnet/signalr';
import {
  mapQuestionFromServer,
  QuestionData,
  QuestionDataFromServer,
} from '../../lib/QuestionsData';

export const QuestionPage = () => {
  const { pathname } = useLocation();

  const [question, setQuestion] = useState<QuestionData | null>(null);
  const connectionRef = useRef<HubConnection | null>(null);

  const dispatch = useDispatch<AppDispatch>();
  const { viewing, loading, postedAnswerResult } = useSelector(
    (state: RootState) => state.questions,
  );

  const setUpSignalRConnection = async (questionId: number) => {
    const connection = new HubConnectionBuilder()
      .withUrl('https://localhost:7119/questionhub')
      .configureLogging(LogLevel.Information)
      .withAutomaticReconnect()
      .build();

    connection.on('Message', (message: string) => {
      console.log('Message', message);
    });

    connection.on('ReceiveQuestion', (question: QuestionDataFromServer) => {
      console.log('ReceiveQuestion', question);
      setQuestion(mapQuestionFromServer(question));
    });

    try {
      await connection.start();
      console.log('SignalR connection established');
    } catch (error) {
      console.error('Error starting SignalR connection:', error);
    }

    if (connection.state === HubConnectionState.Connected) {
      connection
        .invoke('SubscribeQuestion', questionId)
        .catch((err: Error) => console.error('Subscription error:', err));
    }

    connectionRef.current = connection;
    return connection;
  };

  const cleanUpSignalRConnection = async (questionId: number) => {
    const connection = connectionRef.current;
    if (!connection) return;

    if (connection.state === HubConnectionState.Connected) {
      try {
        await connection.invoke('UnsubscribeQuestion', questionId);
      } catch (error) {
        console.error('Unsubscription error:', error);
      }
    }

    connection.off('Message');
    connection.off('ReceiveQuestion');
    await connection.stop();
    console.log('SignalR Connection stopped');
  };

  useEffect(() => {
    const match = matchPath('/questions/:questionId', pathname);

    if (match?.params?.questionId) {
      const questionId = Number(match.params.questionId);
      dispatch(fetchQuestion(questionId));
      setUpSignalRConnection(questionId);
    }

    return () => {
      dispatch(clearPostedAnswer());

      if (match?.params?.questionId) {
        const questionId = Number(match.params.questionId);
        cleanUpSignalRConnection(questionId);
      }
    };
  }, [pathname, dispatch]);

  const handleSubmit = (values: Values) => {
    dispatch(
      postAnswerThunk({
        questionId: question!.questionId,
        content: values.content,
        userName: 'Fred',
        created: new Date(),
      }),
    );
  };

  let submitResult: SubmitResult | undefined;
  if (postedAnswerResult)
    submitResult = { success: postedAnswerResult !== undefined };

  // Update local state when Redux state updates
  useEffect(() => {
    setQuestion(viewing);
  }, [viewing]);

  return (
    <Page>
      <Container>
        <Title>
          {question === null ? (loading ? 'Loading...' : '') : question?.title}
        </Title>

        {question !== null && (
          <Fragment>
            <Content>{question?.content}</Content>

            <UserName>
              {`Asked by ${question.userName} on
                ${question.created.toLocaleDateString()} 
                ${question.created.toLocaleTimeString()}`}
            </UserName>

            <AnswerList data={question.answers} />

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
