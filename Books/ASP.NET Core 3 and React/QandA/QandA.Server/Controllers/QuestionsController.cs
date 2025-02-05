using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Identity.Client;
using QandA.Server.Data;
using QandA.Server.Data.Models;

namespace QandA.Server.Controllers {
    [Route("api/[controller]")]
    [ApiController]

    public class QuestionsController(IDataRepository dataRepository) : ControllerBase {
        private readonly IDataRepository _dataRepository = dataRepository;

        // GET
        [HttpGet]
        public IEnumerable<QuestionGetManyResponse> GetQuestion(string? search) {
            if (string.IsNullOrEmpty(search)) {
                return _dataRepository.GetQuestions();
            } else {
                return _dataRepository.GetQuestionsBySearch(search);
            }
        }

        [HttpGet("unanswered")]
        public IEnumerable<QuestionGetManyResponse> GetUnansweredQuestions() {
            return _dataRepository.GetUnansweredQuestions();
        }

        [HttpGet("{questionId}")]
        public ActionResult<QuestionGetSingleResponse> GetQuestion(int questionId) {
            var question = _dataRepository.GetQuestion(questionId);

            if (question == null) {
                return NotFound();
            }

            return question;
        }

        // POST
        [HttpPost]
        public ActionResult<QuestionGetSingleResponse> PostQuestion(QuestionPostRequest questionPostRequest) {
            var savedQuestion = _dataRepository.PostQuestion(new QuestionPostFullRequest {
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
        public ActionResult<AnswerGetResponse> PostAnswer(AnswerPostRequest answerPostRequest) {
            if (!answerPostRequest.QuestionId.HasValue) {
                return BadRequest("QuestionId is required.");
            }

            var questionExists = _dataRepository.QuestionExists(answerPostRequest.QuestionId.Value);
            if (!questionExists) {
                return NotFound("Question not found.");
            }

            if (!ModelState.IsValid) {
                return BadRequest(ModelState);
            }

            var savedAnswer = _dataRepository.PostAnswer(new AnswerPostFullRequest {
                QuestionId = answerPostRequest.QuestionId.Value,
                Content = answerPostRequest.Content,
                UserId = "1",
                UserName = "bob.test@test.com",
                Created = DateTime.UtcNow
            });

            return Ok(savedAnswer);
        }

        // PUT
        [HttpPut("{questionId}")]
        public ActionResult<QuestionGetSingleResponse> PutQuestion(int questionId, QuestionPutRequest questionPutRequest) {
            var question = _dataRepository.GetQuestion(questionId);

            if (question == null) {
                return NotFound();
            }

            questionPutRequest.Title = string.IsNullOrEmpty(questionPutRequest.Title) ? question.Title : questionPutRequest.Title;
            questionPutRequest.Content = string.IsNullOrEmpty(questionPutRequest.Content) ? question.Content : questionPutRequest.Content;

            var savedQuestion = _dataRepository.PutQuestion(questionId, questionPutRequest);
            return Ok(savedQuestion);
        }

        // DELETE
        [HttpDelete("{questionId}")]
        public ActionResult DeleteQuestion(int questionId) {
            var question = _dataRepository.GetQuestion(questionId);

            if (question == null) {
                return NotFound();
            }

            _dataRepository.DeleteQuestion(questionId);
            return NoContent();
        }
    }
}
