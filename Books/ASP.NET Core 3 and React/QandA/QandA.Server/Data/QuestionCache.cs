using Microsoft.Extensions.Caching.Memory;
using QandA.Server.Data.Models;

namespace QandA.Server.Data {
    public class QuestionCache: IQuestionCache {
        private MemoryCache Cache { get; set; } 

        public QuestionCache() {
            Cache = new MemoryCache(new MemoryCacheOptions {
                SizeLimit = 100
            });
        }

        private static string GetCacheKey(int questionId) {
            return $"Question-{questionId}";
        }

        public QuestionGetSingleResponse? Get(int questionId) {
            Cache.TryGetValue(GetCacheKey(questionId), out QuestionGetSingleResponse? question);
            return question;
        }

        public void Set(QuestionGetSingleResponse question) {
            var cacheEntryOptions = new MemoryCacheEntryOptions().SetSize(1);
            Cache.Set(GetCacheKey(question.QuestionId), question, cacheEntryOptions);
        }

        public void Remove(int questionId) {
            Cache.Remove(GetCacheKey(questionId));
        }
    }
}
