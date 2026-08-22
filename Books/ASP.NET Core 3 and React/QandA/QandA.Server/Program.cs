using DbUp;
using QandA.Server.Data;
using QandA.Server.Hubs;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using QandA.Server.Authorization;
using Microsoft.Azure.SignalR;

var builder = WebApplication.CreateBuilder(args);

// Retrieve the connection string
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

// Ensure the database exists
EnsureDatabase.For.SqlDatabase(connectionString);

// Set up the upgrader
var upgrader = DeployChanges.To
    .SqlDatabase(connectionString, null)
    .WithScriptsEmbeddedInAssembly(System.Reflection.Assembly.GetExecutingAssembly())
    .WithTransaction()
    .LogToConsole()
    .Build();

// Perform database upgrade if needed
if (upgrader.IsUpgradeRequired()) {
    var result = upgrader.PerformUpgrade();

    if (!result.Successful) {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine(result.Error);
        Console.ResetColor();
        return;
    }
}

builder.Services.AddControllers();
builder.Services.AddScoped<IDataRepository, DataRepository>();

builder.Services.AddSignalR();

builder.Services.AddCors(options => {
    options.AddPolicy("CorsPolicy", build => {
        build
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();

        var frontendOrigin = builder.Configuration["Frontend"];
        if (!string.IsNullOrEmpty(frontendOrigin)) {
            build.WithOrigins(frontendOrigin);
        }
    });
});


// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<IQuestionCache, QuestionCache>();

builder.Services.AddAuthentication(options => {
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
}).AddJwtBearer(options => {
    options.Authority = builder.Configuration["Auth0:Authority"];
    options.Audience = builder.Configuration["Auth0:Audience"];
});

builder.Services.AddHttpClient();
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("MustBeQuestionAuthor", policy => {
        policy.Requirements.Add(new MustBeQuestionAuthorRequirement());
    });

builder.Services.AddScoped<IAuthorizationHandler, MustBeQuestionAuthorHandler>();
builder.Services.AddSingleton<IHttpContextAccessor, HttpContextAccessor>();

var app = builder.Build();

app.UseCors("CorsPolicy");

app.UseDefaultFiles();
app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment()) {
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<QuestionsHub>("/questionhub");

app.MapFallbackToFile("/index.html");

app.Run();
