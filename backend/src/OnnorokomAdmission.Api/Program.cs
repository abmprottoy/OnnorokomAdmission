/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: Application entry point, DI configuration, and HTTP endpoint mappings.
 */

using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using OnnorokomAdmission.Api.Data;
using OnnorokomAdmission.Api.Models;
using OnnorokomAdmission.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Parse HOLD_DURATION_SECONDS environment variable (Default: 600 seconds)
var holdDurationRaw = Environment.GetEnvironmentVariable("HOLD_DURATION_SECONDS")
                      ?? builder.Configuration["HOLD_DURATION_SECONDS"];
var holdDurationSeconds = int.TryParse(holdDurationRaw, out var parsedSeconds) && parsedSeconds > 0
    ? parsedSeconds
    : 600;

builder.Services.AddSingleton(new AdmissionSettings
{
    HoldDurationSeconds = holdDurationSeconds
});

// Resolve PostgreSQL connection string strictly from environment variables or config (§1.2)
static string ResolveConnectionString(IConfiguration config)
{
    var raw = Environment.GetEnvironmentVariable("DATABASE_URL")
              ?? Environment.GetEnvironmentVariable("POSTGRES_CONNECTION_STRING")
              ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
              ?? config.GetConnectionString("DefaultConnection");

    if (string.IsNullOrWhiteSpace(raw))
    {
        throw new InvalidOperationException(
            "Database connection string is not configured. Set the DATABASE_URL or ConnectionStrings__DefaultConnection environment variable.");
    }

    if (raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        var uri = new Uri(raw);
        var userInfo = uri.UserInfo.Split(':', 2);
        var npgsqlBuilder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "postgres",
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
            Pooling = true
        };
        return npgsqlBuilder.ConnectionString;
    }

    return raw;
}

builder.Services.AddDbContext<AdmissionDbContext>((sp, options) =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    options.UseNpgsql(ResolveConnectionString(config));
});

builder.Services.AddScoped<AdmissionService>();
builder.Services.AddHostedService<HoldExpirationWorker>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// Ensure database schema is created on startup (with retry for Docker container startup order)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AdmissionDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    const int maxRetries = 10;
    for (var attempt = 1; attempt <= maxRetries; attempt++)
    {
        try
        {
            await db.Database.EnsureCreatedAsync();
            break;
        }
        catch (Exception ex) when (attempt < maxRetries)
        {
            logger.LogWarning(ex, "Waiting for database to be ready (Attempt {Attempt}/{MaxRetries})...", attempt, maxRetries);
            await Task.Delay(TimeSpan.FromSeconds(2));
        }
    }
}

// Rule 7: Never return 500 on bad JSON or invalid request payloads; return 4xx instead
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var exceptionFeature = context.Features.Get<IExceptionHandlerFeature>();
        var exception = exceptionFeature?.Error;

        if (exception is BadHttpRequestException || exception is System.Text.Json.JsonException)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new ApiErrorResponse(
                "BAD_REQUEST",
                "Invalid request payload or malformed JSON."));
            return;
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new ApiErrorResponse(
            "SERVER_ERROR",
            "An unexpected server error occurred."));
    });
});

app.UseCors();

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Author"] = "Developed by Ammar Bin Mahmud <@abmprottoy>";
    await next();
});

// ============================================================================
// API Endpoints
// ============================================================================

// 1. POST /classes - Create a new class
app.MapPost("/classes", async (HttpContext httpContext, AdmissionService service, CancellationToken ct) =>
{
    CreateClassRequest? request;
    try
    {
        request = await httpContext.Request.ReadFromJsonAsync<CreateClassRequest>(cancellationToken: ct);
    }
    catch
    {
        return Results.BadRequest(new ApiErrorResponse("INVALID_JSON", "Invalid JSON body."));
    }

    var (statusCode, body) = await service.CreateClassAsync(request, ct);
    return Results.Json(body, statusCode: statusCode);
});

// 2. GET /classes - List all classes with seat counts
app.MapGet("/classes", async (AdmissionService service, CancellationToken ct) =>
{
    var classes = await service.GetAllClassesAsync(ct);
    return Results.Ok(classes);
});

// 3. GET /classes/{classId} - Get seat status for a single class
app.MapGet("/classes/{classId}", async (string classId, AdmissionService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(classId))
    {
        return Results.BadRequest(new ApiErrorResponse("INVALID_CLASS_ID", "Class ID is required."));
    }

    var result = await service.GetClassByIdAsync(classId.Trim(), ct);
    if (result is null)
    {
        return Results.NotFound(new ApiErrorResponse("CLASS_NOT_FOUND", "Class not found."));
    }

    return Results.Ok(result);
});

// 4. POST /classes/{classId}/holds - Place a seat hold
app.MapPost("/classes/{classId}/holds", async (string classId, HttpContext httpContext, AdmissionService service, CancellationToken ct) =>
{
    var rawStudentId = httpContext.Request.Headers["X-Student-Id"].FirstOrDefault();
    var (isValid, cleanStudentId, errorMsg) = AdmissionService.ValidateStudentId(rawStudentId);
    if (!isValid)
    {
        return Results.BadRequest(new ApiErrorResponse("INVALID_STUDENT_ID", errorMsg));
    }

    var (statusCode, body) = await service.CreateHoldAsync(classId.Trim(), cleanStudentId, ct);
    return Results.Json(body, statusCode: statusCode);
});

// 5. GET /holds/{holdId} - Get current status of a hold
app.MapGet("/holds/{holdId}", async (string holdId, AdmissionService service, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(holdId))
    {
        return Results.BadRequest(new ApiErrorResponse("INVALID_HOLD_ID", "Hold ID is required."));
    }

    var hold = await service.GetHoldByIdAsync(holdId.Trim(), ct);
    if (hold is null)
    {
        return Results.NotFound(new ApiErrorResponse("HOLD_NOT_FOUND", "Hold not found."));
    }

    return Results.Ok(hold);
});

// 6. POST /holds/{holdId}/confirm - Confirm admission fee payment and seat
app.MapPost("/holds/{holdId}/confirm", async (string holdId, HttpContext httpContext, AdmissionService service, CancellationToken ct) =>
{
    var rawStudentId = httpContext.Request.Headers["X-Student-Id"].FirstOrDefault();
    var (isValid, cleanStudentId, errorMsg) = AdmissionService.ValidateStudentId(rawStudentId);
    if (!isValid)
    {
        return Results.BadRequest(new ApiErrorResponse("INVALID_STUDENT_ID", errorMsg));
    }

    var (statusCode, body) = await service.ConfirmHoldAsync(holdId.Trim(), cleanStudentId, ct);
    return Results.Json(body, statusCode: statusCode);
});

// 7. DELETE /holds/{holdId} - Cancel an active hold
app.MapDelete("/holds/{holdId}", async (string holdId, HttpContext httpContext, AdmissionService service, CancellationToken ct) =>
{
    var rawStudentId = httpContext.Request.Headers["X-Student-Id"].FirstOrDefault();
    var (isValid, cleanStudentId, errorMsg) = AdmissionService.ValidateStudentId(rawStudentId);
    if (!isValid)
    {
        return Results.BadRequest(new ApiErrorResponse("INVALID_STUDENT_ID", errorMsg));
    }

    var (statusCode, body) = await service.CancelHoldAsync(holdId.Trim(), cleanStudentId, ct);
    if (statusCode == StatusCodes.Status204NoContent)
    {
        return Results.NoContent();
    }

    return Results.Json(body, statusCode: statusCode);
});

// 8. GET /me/holds - List all holds for the current student
app.MapGet("/me/holds", async (HttpContext httpContext, AdmissionService service, CancellationToken ct) =>
{
    var rawStudentId = httpContext.Request.Headers["X-Student-Id"].FirstOrDefault();
    var (isValid, cleanStudentId, errorMsg) = AdmissionService.ValidateStudentId(rawStudentId);
    if (!isValid)
    {
        return Results.BadRequest(new ApiErrorResponse("INVALID_STUDENT_ID", errorMsg));
    }

    var holds = await service.GetStudentHoldsAsync(cleanStudentId, ct);
    return Results.Ok(holds);
});

app.Run();

// Expose Program class for WebApplicationFactory in automated integration/concurrency tests
public partial class Program { }