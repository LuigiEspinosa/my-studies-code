using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using QandA.Server.Data;

namespace QandA.Server.Authorization {
    public class MustBeQuestionAuthorHandler(
        IDataRepository dataRepository, 
        IHttpContextAccessor httpContextAccessor
    ) : AuthorizationHandler<MustBeQuestionAuthorRequirement> {
        private readonly IDataRepository _dataRepository = dataRepository;
        private readonly IHttpContextAccessor _httpContextAccessor = httpContextAccessor;

        protected async override Task HandleRequirementAsync(AuthorizationHandlerContext context, MustBeQuestionAuthorRequirement requirement) {
            if (context.User?.Identity?.IsAuthenticated != true) {
                context.Fail();
                return;
            }

            var httpContext = _httpContextAccessor.HttpContext;
            if (httpContext?.Request?.RouteValues == null) {
                context.Fail();
                return;
            }

            var questionId = httpContext.Request.RouteValues["questionId"];
            int questionIdAsInt = Convert.ToInt32(questionId);

            var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId)) {
                context.Fail();
                return;
            }

            var question = await _dataRepository.GetQuestion(questionIdAsInt);
            if (question == null) {
                // Let it through so the controller can return a 404
                context.Succeed(requirement);
                return;
            }

            if (question.UserId != userId) {
                context.Fail();
                return;
            }

            context.Succeed(requirement);
        }
    }
}
