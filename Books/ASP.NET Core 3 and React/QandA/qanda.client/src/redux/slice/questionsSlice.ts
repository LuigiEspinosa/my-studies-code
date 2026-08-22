import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  getUnansweredQuestions,
  getQuestion,
  postQuestion,
  postAnswer,
  searchQuestions,
  QuestionData,
  PostQuestionData,
  PostAnswerData,
  AnswerData,
} from '../../lib/QuestionsData';

interface QuestionsState {
  loading: boolean;
  unanswered: QuestionData[] | null;
  viewing: QuestionData | null;
  searched: QuestionData[] | null;
  postedResult?: QuestionData;
  postedAnswerResult?: AnswerData;
}

const initialState: QuestionsState = {
  loading: false,
  unanswered: null,
  viewing: null,
  searched: null,
};

export const fetchUnansweredQuestions = createAsyncThunk(
  'questions/fetchUnanswered',
  async () => {
    return await getUnansweredQuestions();
  },
);

export const fetchQuestion = createAsyncThunk(
  'questions/fetchQuestion',
  async (questionId: number) => {
    return await getQuestion(questionId);
  },
);

export const searchQuestionsThunk = createAsyncThunk(
  'questions/search',
  async (criteria: string) => {
    return await searchQuestions(criteria);
  },
);

export const postQuestionThunk = createAsyncThunk(
  'questions/post',
  async (question: PostQuestionData) => {
    return await postQuestion(question);
  },
);

export const postAnswerThunk = createAsyncThunk(
  'questions/postAnswer',
  async (answer: PostAnswerData) => {
    return await postAnswer(answer);
  },
);

const questionsSlice = createSlice({
  name: 'questions',
  initialState,
  reducers: {
    clearPostedQuestion(state) {
      state.postedResult = undefined;
    },
    clearPostedAnswer(state) {
      state.postedAnswerResult = undefined;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUnansweredQuestions.pending, (state) => {
        state.loading = true;
        state.unanswered = null;
      })
      .addCase(fetchUnansweredQuestions.fulfilled, (state, action) => {
        state.loading = false;
        state.unanswered = action.payload;
      })
      .addCase(fetchQuestion.pending, (state) => {
        state.loading = true;
        state.viewing = null;
      })
      .addCase(fetchQuestion.fulfilled, (state, action) => {
        state.loading = false;
        state.viewing = action.payload;
      })
      .addCase(searchQuestionsThunk.pending, (state) => {
        state.loading = true;
        state.searched = null;
      })
      .addCase(searchQuestionsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.searched = action.payload;
      })
      .addCase(postQuestionThunk.fulfilled, (state, action) => {
        if (action.payload) {
          state.unanswered = [...(state.unanswered || []), action.payload];
          state.postedResult = action.payload;
        }
      })
      .addCase(postAnswerThunk.fulfilled, (state, action) => {
        if (action.payload) {
          state.unanswered = (state.unanswered || []).filter(
            (q) => q.questionId !== action.meta.arg.questionId,
          );
          state.postedAnswerResult = action.payload;
        }
      });
  },
});

export const { clearPostedQuestion, clearPostedAnswer } =
  questionsSlice.actions;

export default questionsSlice.reducer;
