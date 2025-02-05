using System.ComponentModel.DataAnnotations;

namespace QandA.Server.Data.Models {
    public class AnswerPostRequest {
        [Required]
        public int? QuestionId { get; set; }

        [Required]
        public required string Content { get; set; }
    }
}
