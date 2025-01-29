import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../redux/store/store';
import {
  clearPostedQuestion,
  postQuestionThunk,
} from '../../redux/slice/questionsSlice';
import { Page } from '../Page';
import {
  Form,
  minLength,
  required,
  SubmitResult,
  Values,
} from '../../components/Form';
import { Field } from '../../components/Form/Field';

export const AskPage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { postedResult } = useSelector((state: RootState) => state.questions);

  useEffect(() => {
    return function cleanUp() {
      dispatch(clearPostedQuestion());
    };
  }, [clearPostedQuestion]);

  const handleSubmit = (values: Values) => {
    dispatch(
      postQuestionThunk({
        title: values.title,
        content: values.content,
        userName: 'Fred',
        created: new Date(),
      }),
    );
  };

  let submitResult: SubmitResult | undefined;
  if (postedResult) submitResult = { success: postedResult !== undefined };

  return (
    <Page title="Ask a Question">
      <Form
        submitCaption="Submit Your Question"
        validationRules={{
          title: [{ validator: required }, { validator: minLength, arg: 10 }],
          content: [{ validator: required }, { validator: minLength, arg: 50 }],
        }}
        onSubmit={handleSubmit}
        submitResult={submitResult}
        failureMessage="There was a problem with your question"
        successMessage="Your question was successfully submitted"
      >
        <Field name="title" label="Title" />
        <Field name="content" label="Content" type="TextArea" />
      </Form>
    </Page>
  );
};
