using Microsoft.AspNetCore.Mvc;
using QandA.Server.Data;
using QandA.Server.Data.Models;
using Microsoft.AspNetCore.SignalR;
using QandA.Server.Hubs;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using System.Net.Http;
using System.Text.Json;

namespace QandA.Server.Controllers {
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]

    public class QuestionsController(
        IDataRepository dataRepository, 
        IHubContext<QuestionsHub> questionHubContext, 
        IQuestionCache questionCache,
        IHttpClientFactory clientFactory,
        IConfiguration configuration
    ) : ControllerBase {
        private readonly IDataRepository _dataRepository = dataRepository;
        private readonly IHubContext<QuestionsHub> _questionHubContext = questionHubContext;
        private readonly IQuestionCache _cache = questionCache;
        private readonly IHttpClientFactory _clientFactory = clientFactory;
        private readonly string _auth0UserInfo = $"{configuration["Auth0:Authority"]}userinfo";

        // GET
        [AllowAnonymous]
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

        [AllowAnonymous]
        [HttpGet("unanswered")]
        public async Task<IEnumerable<QuestionGetManyResponse>> GetUnansweredQuestions() {
            return await _dataRepository.GetUnansweredQuestionsAsync();
        }

        [AllowAnonymous]
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

        private static readonly JsonSerializerOptions _jsonOptions = new() {
            PropertyNameCaseInsensitive = true
        };

        private async Task<string> GetUserName() {
            var request = new HttpRequestMessage(HttpMethod.Get, _auth0UserInfo);
            request.Headers.Add("Authorization", Request.Headers.Authorization.First());

            var client = _clientFactory.CreateClient();
            var response = await client.SendAsync(request);

            if (response.IsSuccessStatusCode) {
                var jsonContent = await response.Content.ReadAsStringAsync();
                var user = JsonSerializer.Deserialize<User>(jsonContent, _jsonOptions);

                if (user == null) {
                    return "";
                }

                return user.Name;
            } else {
                return "";
            }
        }


        // POST
        [Authorize]
        [HttpPost]
        public async Task<ActionResult<QuestionGetSingleResponse>> PostQuestion(QuestionPostRequest questionPostRequest) {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim == null) {
                return BadRequest("User not authenticated.");
            }

            var savedQuestion = await _dataRepository.PostQuestion(new QuestionPostFullRequest {
                Title = questionPostRequest.Title,
                Content = questionPostRequest.Content,
                UserId = userIdClaim.Value,
                UserName = await GetUserName(),
                Created = DateTime.UtcNow
            });

            return CreatedAtAction(nameof(GetQuestion), 
                new { questionId = savedQuestion.QuestionId }, 
                savedQuestion);
        }

        [Authorize]
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

            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim == null) {
                return BadRequest("User not authenticated.");
            }

            var savedAnswer = await _dataRepository.PostAnswer(new AnswerPostFullRequest {
                QuestionId = answerPostRequest.QuestionId.Value,
                Content = answerPostRequest.Content,
                UserId = userIdClaim.Value,
                UserName = await GetUserName(),
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
        [Authorize(Policy = "MustBeQuestionAuthor")]
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
        [Authorize(Policy = "MustBeQuestionAuthor")]
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
