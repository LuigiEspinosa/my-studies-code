using QandA.Server.Data.Models;

namespace QandA.Server.Data {
    public interface IDataRepository {
        IEnumerable<QuestionGetManyResponse> GetQuestions();
        IEnumerable<QuestionGetManyResponse> GetQuestionsBySearch(string search);
        IEnumerable<QuestionGetManyResponse> GetUnansweredQuestions();

        QuestionGetSingleResponse GetQuestion(int questionId);
        QuestionGetSingleResponse PostQuestion(QuestionPostFullRequest question);
        QuestionGetSingleResponse PutQuestion(int questionId, QuestionPutRequest question);

        bool QuestionExists(int questionId);

        AnswerGetResponse GetAnswer(int answerId);
        AnswerGetResponse PostAnswer(AnswerPostFullRequest answer);

        void DeleteQuestion(int questionId);
    }
}
