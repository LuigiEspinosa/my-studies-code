using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Moq;
using QandA.Server.Controllers;
using QandA.Server.Data;
using QandA.Server.Data.Models;
using Xunit;

namespace BackendTests {
    public class QuestionsControllerTests {
        private readonly Mock<IDataRepository> mockDataRepository;
        private readonly Mock<IHubContext<QandA.Server.Hubs.QuestionsHub>> mockHubContext;
        private readonly Mock<IQuestionCache> mockQuestionCache;
        private readonly Mock<IHttpClientFactory> mockHttpClientFactory;
        private readonly Mock<IConfigurationRoot> mockConfigurationRoot;
        private readonly QuestionsController questionsController;

        public QuestionsControllerTests() {
            mockDataRepository = new Mock<IDataRepository>();
            mockHubContext = new Mock<IHubContext<QandA.Server.Hubs.QuestionsHub>>();
            mockQuestionCache = new Mock<IQuestionCache>();
            mockHttpClientFactory = new Mock<IHttpClientFactory>();
            mockConfigurationRoot = new Mock<IConfigurationRoot>();

            mockConfigurationRoot
                .SetupGet(config => config[It.IsAny<string>()])
                .Returns("some setting");

            questionsController = new QuestionsController(
                mockDataRepository.Object,
                mockHubContext.Object,
                mockQuestionCache.Object,
                mockHttpClientFactory.Object,
                mockConfigurationRoot.Object
            );
        }

        [Fact]
        public async Task GetQuestions_WhenNoParameters_ReturnsAllQuestions() {
            var mockQuestions = Enumerable.Range(1, 10).Select(i => new QuestionGetManyResponse {
                QuestionId = i,
                Title = $"Test title {i}",
                Content = $"Test content {i}",
                UserName = "User1",
                Answers = []
            }).ToList();

            mockDataRepository
                .Setup(repo => repo.GetQuestions())
                .ReturnsAsync(mockQuestions.AsEnumerable());

            var result = await questionsController.GetQuestions(null, false);

            Assert.Equal(10, result.Count());
            mockDataRepository.Verify(mock => mock.GetQuestions(), Times.Once());
        }

        [Fact]
        public async Task GetQuestions_WhenHaveSearchParameter_ReturnsCorrectQuestions() {
            var mockQuestions = new List<QuestionGetManyResponse> {
                new() {
                    QuestionId = 1,
                    Title = "Test",
                    Content = "Test Content",
                    UserName = "User1",
                    Answers = []
                }
            };

            mockDataRepository
                .Setup(repo => repo.GetQuestionsBySearchWithPaging("Test", 1, 20))
                .ReturnsAsync(mockQuestions.AsEnumerable());

            var result = await questionsController.GetQuestions("Test", false);

            Assert.Single(result);
            mockDataRepository.Verify(mock => mock.GetQuestionsBySearchWithPaging("Test", 1, 20), Times.Once());
        }

        [Fact]
        public async Task GetQuestion_WhenQuestionNotFound_Returns404() {
            #pragma warning disable CS8620 // Argument cannot be used for parameter due to differences in the nullability of reference types.
            mockDataRepository
                .Setup(repo => repo.GetQuestion(1))
                .ReturnsAsync((QuestionGetSingleResponse?)null);

            mockQuestionCache
                .Setup(cache => cache.Get(1))
                .Returns(() => null);

            var result = await questionsController.GetQuestion(1);
            var actionResult = Assert.IsType<ActionResult<QuestionGetSingleResponse>>(result);

            Assert.IsType<NotFoundResult>(actionResult.Result);
        }

        [Fact]
        public async Task GetQuestion_WhenQuestionIsFound_ReturnsQuestion() {
            var mockQuestion = new QuestionGetSingleResponse {
                QuestionId = 1,
                Title = "Test"
            };

            mockDataRepository
                .Setup(repo => repo.GetQuestion(1))
                .ReturnsAsync(mockQuestion);

            mockQuestionCache
                .Setup(cache => cache.Get(1))
                .Returns(() => mockQuestion);

            var result = await questionsController.GetQuestion(1);
            var actionResult = Assert.IsType<ActionResult<QuestionGetSingleResponse>>(result);
            Assert.NotNull(actionResult.Result);

            var okResult = Assert.IsType<OkObjectResult>(actionResult.Result);
            Assert.NotNull(okResult.Value);

            var questionResult = Assert.IsType<QuestionGetSingleResponse>(okResult.Value);
            Assert.Equal(1, questionResult.QuestionId);
        }

    }
}
