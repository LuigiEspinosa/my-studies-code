using DbUp;
using QandA.Server.Data;
using QandA.Server.Hubs;

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
    options.AddPolicy("CorsPolicy", builder => {
        builder
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials()
            .SetIsOriginAllowed(origin => true); // Allow all origins
    });
});

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<IQuestionCache, QuestionCache>();

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

app.UseAuthorization();

app.MapControllers();
app.MapHub<QuestionsHub>("/questionhub");

app.MapFallbackToFile("/index.html");

app.Run();
