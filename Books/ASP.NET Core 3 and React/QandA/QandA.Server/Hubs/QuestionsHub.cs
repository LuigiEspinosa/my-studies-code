using Microsoft.AspNetCore.SignalR;
using System;
using System.Threading.Tasks;

namespace QandA.Server.Hubs {
    public class QuestionsHub : Hub {
        public override async Task OnConnectedAsync() {
            await base.OnConnectedAsync();
            await Clients.Caller.SendAsync("Message", "Successfully Connected");
        }

        public override async Task OnDisconnectedAsync(Exception? exception) {
            await Clients.Caller.SendAsync("Message", "Successfully Disconnected");
            await base.OnDisconnectedAsync(exception);
        }

        public async Task SubscribeQuestion(int questionId) {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"Question-{questionId}");
            await Clients.Caller.SendAsync("Message", "Successfully Subscribed");
        }

        public async Task UnsubscribeQuestion(int questionId) {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"Question-{questionId}");
            await Clients.Caller.SendAsync("Message", "Successfully Unsubscribed");
        }
    }
}
