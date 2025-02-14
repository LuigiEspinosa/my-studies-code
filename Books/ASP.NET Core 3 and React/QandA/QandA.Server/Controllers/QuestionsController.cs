using Microsoft.AspNetCore.Mvc;
using QandA.Server.Data;
using QandA.Server.Data.Models;
using Microsoft.AspNetCore.SignalR;
using QandA.Server.Hubs;

namespace QandA.Server.Controllers {
    [Route("api/[controller]")]
    [ApiController]

    public class QuestionsController(
        IDataRepository dataRepository, 
        IHubContext<QuestionsHub> questionHubContext, 
        IQuestionCache questionCache
    ) : ControllerBase {
        private readonly IDataRepository _dataRepository = dataRepository;
        private readonly IHubContext<QuestionsHub> _questionHubContext = questionHubContext;
        private readonly IQuestionCache _cache = questionCache;

        // GET
        [HttpGet]
        public async Task<IEnumerable<QuestionGetManyResponse>> GetQuestions(string? search, bool includeAnswers, int page = 1, int pageSize = 20) {
            if (string.IsNullOrEmpty(search)) {
                if (includeAnswers) {
                    return await _dataRepository.GetQuestionsWithAnswers();
                } else {
                    return await _dataRepository.GetQuestions();
                }
            } else {
                return await _dataRepository.GetQuestionsBySearchWithPaging(search, page, pageSize);
            }
        }

        [HttpGet("unanswered")]
        public async Task<IEnumerable<QuestionGetManyResponse>> GetUnansweredQuestions() {
            return await _dataRepository.GetUnansweredQuestionsAsync();
        }

        [HttpGet("{questionId}")]
        public async Task<ActionResult<QuestionGetSingleResponse>> GetQuestion(int questionId) {
            var question = _cache.Get(questionId);

            if (question == null) {
                question = await _dataRepository.GetQuestion(questionId);

                if (question == null) {
                    return NotFound();
                }

                _cache.Set(question);
            }

            return Ok(question);
        }

        // POST
        [HttpPost]
        public async Task<ActionResult<QuestionGetSingleResponse>> PostQuestion(QuestionPostRequest questionPostRequest) {
            var savedQuestion = await _dataRepository.PostQuestion(new QuestionPostFullRequest {
                Title = questionPostRequest.Title,
                Content = questionPostRequest.Content,
                UserId = "1",
                UserName = "bob.test@test.com",
                Created = DateTime.UtcNow
            });

            return CreatedAtAction(nameof(GetQuestion), 
                new { questionId = savedQuestion.QuestionId }, 
                savedQuestion);
        }

        [HttpPost("answer")]
        public async Task<ActionResult<AnswerGetResponse>> PostAnswer(AnswerPostRequest answerPostRequest) {
            if (!answerPostRequest.QuestionId.HasValue) {
                return BadRequest("QuestionId is required.");
            }

            var questionExists = await _dataRepository.QuestionExists(answerPostRequest.QuestionId.Value);
            if (!questionExists) {
                return NotFound("Question not found.");
            }

            if (!ModelState.IsValid) {
                return BadRequest(ModelState);
            }

            var savedAnswer = await _dataRepository.PostAnswer(new AnswerPostFullRequest {
                QuestionId = answerPostRequest.QuestionId.Value,
                Content = answerPostRequest.Content,
                UserId = "1",
                UserName = "bob.test@test.com",
                Created = DateTime.UtcNow
            });

            await _questionHubContext.Clients.Group(
                $"Question-{answerPostRequest.QuestionId.Value}")
                    .SendAsync("ReceiveQuestion", _dataRepository.GetQuestion(
                        answerPostRequest.QuestionId.Value));

            _cache.Remove(answerPostRequest.QuestionId.Value);

            return Ok(savedAnswer);
        }

        // PUT
        [HttpPut("{questionId}")]
        public async Task<ActionResult<QuestionGetSingleResponse>> PutQuestion(int questionId, QuestionPutRequest questionPutRequest) {
            var question = await _dataRepository.GetQuestion(questionId);

            if (question == null) {
                return NotFound();
            }

            questionPutRequest.Title = string.IsNullOrEmpty(questionPutRequest.Title) ? question.Title : questionPutRequest.Title;
            questionPutRequest.Content = string.IsNullOrEmpty(questionPutRequest.Content) ? question.Content : questionPutRequest.Content;

            var savedQuestion = await _dataRepository.PutQuestion(questionId, questionPutRequest);
            _cache.Remove(savedQuestion.QuestionId);
            
            return Ok(savedQuestion);
        }

        // DELETE
        [HttpDelete("{questionId}")]
        public async Task<ActionResult> DeleteQuestion(int questionId) {
            var question = await _dataRepository.GetQuestion(questionId);

            if (question == null) {
                return NotFound();
            }

            await _dataRepository.DeleteQuestion(questionId);
            _cache.Remove(questionId);

            return NoContent();
        }
    }
}
