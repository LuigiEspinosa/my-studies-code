using QandA.Server.Data.Models;

namespace QandA.Server.Data {
    public interface IQuestionCache {
        QuestionGetSingleResponse? Get(int questionId);
        void Remove(int questionId);
        void Set(QuestionGetSingleResponse question);
    }
}