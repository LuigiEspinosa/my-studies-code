using System.ComponentModel.DataAnnotations;

namespace QandA.Server.Data.Models {
    public class QuestionPostRequest {
        [Required]
        [StringLength(100)]
        public required string Title { get; set; }

        [Required(ErrorMessage = "Please include some content for the question")]
        public required string Content { get; set; }
    }
}
