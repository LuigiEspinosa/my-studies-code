using Microsoft.Data.SqlClient;
using Dapper;
using QandA.Server.Data.Models;

namespace QandA.Server.Data {
    public class DataRepository(IConfiguration configuration) : IDataRepository
    {
        private readonly string _connectionString = configuration["ConnectionStrings:DefaultConnection"]
                ?? throw new ArgumentNullException(nameof(configuration), "Database connection string is missing.");

        public AnswerGetResponse GetAnswer(int answerId) {
            using (var connection = new SqlConnection(_connectionString)) {
                connection.Open();
                var answer = connection.QueryFirstOrDefault<AnswerGetResponse>(
                    @"EXEC dbo.Answer_Get_ByAnswerId @AnswerId = @AnswerId",
                    new { AnswerId = answerId }
                );

                if (answer is null) {
                    throw new InvalidOperationException($"Answer with ID {answerId} not found.");
                }

                return answer;
            }
        }

        public QuestionGetSingleResponse GetQuestion(int questionId) {
            using (var connection = new SqlConnection(_connectionString)) { 
                connection.Open();
                var question =
                    connection.QueryFirstOrDefault<QuestionGetSingleResponse>(
                        @"EXEC dbo.Question_GetSingle @QuestionId = @QuestionId",
                        new { QuestionId = questionId }
                    );

                if (question != null) {
                    question.Answers =
                        connection.Query<AnswerGetResponse>(
                            @"EXEC dbo.Answer_Get_ByQuestionId
                                @QuestionId = @QuestionId",
                            new { QuestionId = questionId }
                        );
                } else {
                    throw new InvalidOperationException($"Question with ID {questionId} not found.");
                }

                return question;
            }
        }

        public IEnumerable<QuestionGetManyResponse> GetQuestions() {
            using (var connection = new SqlConnection(_connectionString)) {
                connection.Open();
                return connection.Query<QuestionGetManyResponse>(
                    @"EXEC dbo.Question_GetMany"
                );
            }
        }

        public IEnumerable<QuestionGetManyResponse> GetQuestionsBySearch(string search) {
            using (var connection = new SqlConnection(_connectionString)) {
                connection.Open();
                return connection.Query<QuestionGetManyResponse>(
                    @"EXEC dbo.Question_GetMany_BySearch @Search = @Search",
                    new { Search = search }
                );
            }
        }

        public IEnumerable<QuestionGetManyResponse> GetUnansweredQuestions() {
            using (var connection = new SqlConnection(_connectionString)) {
                connection.Open();
                return connection.Query<QuestionGetManyResponse>(
                    "EXEC dbo.Question_GetUnanswered"
                );
            }
        }

        public bool QuestionExists(int questionId) {
            using (var connection = new SqlConnection(_connectionString)) {
                connection.Open();
                return connection.QueryFirst<bool>(
                    @"EXEC dbo.Question_Exist @QuestionId = @QuestionId",
                    new { QuestionId = questionId }
                );
            }
        }

        public QuestionGetSingleResponse PostQuestion(QuestionPostRequest question) {
            using (var connection = new SqlConnection(_connectionString)) {
                connection.Open();

                var questionId = connection.QueryFirst<int>(
                  @"EXEC dbo.Question_Post 
                    @Title = @Title, @Content = @Content, 
                    @UserId = @UserId, @UserName = @UserName, 
                    @Created = @Created",
                  question
                );

                return GetQuestion(questionId);
            }
        }

        public QuestionGetSingleResponse PutQuestion(int questionId, QuestionPutRequest question) {
            using (var connection = new SqlConnection(_connectionString)) {
                connection.Open();
                connection.Execute(
                  @"EXEC dbo.Question_Put 
                    @QuestionId = @QuestionId, @Title = @Title, @Content = @Content",
                  new { QuestionId = questionId, question.Title, question.Content }
                );
                return GetQuestion(questionId);
            }
        }

        public void DeleteQuestion(int questionId) {
            using (var connection = new SqlConnection(_connectionString)) {
                connection.Open();
                connection.Execute(
                  @"EXEC dbo.Question_Delete 
                    @QuestionId = @QuestionId",
                  new { QuestionId = questionId }
                );
            }
        }

        public AnswerGetResponse PostAnswer(AnswerPostRequest answer) {
            using (var connection = new SqlConnection(_connectionString)) {
                connection.Open();
                return connection.QueryFirst<AnswerGetResponse>(
                  @"EXEC dbo.Answer_Post 
                    @QuestionId = @QuestionId, @Content = @Content, 
                    @UserId = @UserId, @UserName = @UserName,
                    @Created = @Created",
                  answer
                );
            }
        }
    }
}
