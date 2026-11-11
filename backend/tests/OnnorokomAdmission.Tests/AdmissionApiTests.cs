/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: Automated integration and concurrency tests verifying admission contracts and rules.
 */

using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OnnorokomAdmission.Api.Data;
using OnnorokomAdmission.Api.Models;
using OnnorokomAdmission.Api.Services;

namespace OnnorokomAdmission.Tests;

public class TestWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly string _dbFilePath;
    private readonly string _connectionString;
    private readonly int _holdDurationSeconds;

    public TestWebApplicationFactory(int holdDurationSeconds = 600)
    {
        _holdDurationSeconds = holdDurationSeconds;
        _dbFilePath = Path.Combine(Path.GetTempPath(), $"onnorokom_test_{Guid.NewGuid():N}.db");
        _connectionString = $"Data Source={_dbFilePath};Cache=Shared;Mode=ReadWriteCreate;Default Timeout=30";
    }

    public Task InitializeAsync() => Task.CompletedTask;

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll(typeof(DbContextOptions<AdmissionDbContext>));
            services.RemoveAll(typeof(AdmissionDbContext));
            services.RemoveAll(typeof(AdmissionSettings));

            services.AddSingleton(new AdmissionSettings
            {
                HoldDurationSeconds = _holdDurationSeconds
            });

            services.AddDbContext<AdmissionDbContext>(options =>
            {
                // Passing a connection string gives each concurrent HTTP request its own DbConnection instance
                options.UseSqlite(_connectionString);
            });
        });
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        SqliteConnection.ClearAllPools();
        if (File.Exists(_dbFilePath))
        {
            try { File.Delete(_dbFilePath); } catch { /* ignore cleanup lock */ }
        }
    }
}

public class AdmissionApiTests
{
    private static string GenerateStudentId(int index) =>
        (20152691234560000L + index).ToString();

    [Fact]
    public async Task ConcurrencyTest_50SimultaneousRequestsFor10Seats_Only10HoldsSucceed()
    {
        // Arrange: Create test server and a class with exactly 10 seats
        await using var factory = new TestWebApplicationFactory(holdDurationSeconds: 600);
        await factory.InitializeAsync();
        using var client = factory.CreateClient();

        var createClassRes = await client.PostAsJsonAsync("/classes", new
        {
            name = "Class 6 - Morning Shift",
            totalSeats = 10
        });
        Assert.Equal(HttpStatusCode.Created, createClassRes.StatusCode);

        var createdClass = await createClassRes.Content.ReadFromJsonAsync<CreateClassResponse>();
        Assert.NotNull(createdClass);

        // Act: Fire 50 simultaneous hold requests from 50 distinct students
        const int concurrentRequests = 50;
        var tasks = Enumerable.Range(1, concurrentRequests).Select(async i =>
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
            req.Headers.Add("X-Student-Id", GenerateStudentId(i));
            return await client.SendAsync(req);
        });

        var responses = await Task.WhenAll(tasks);

        // Assert: Exactly 10 requests must succeed (201 Created) and 40 must fail (409 Conflict)
        var createdCount = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
        var conflictCount = responses.Count(r => r.StatusCode == HttpStatusCode.Conflict);

        Assert.Equal(10, createdCount);
        Assert.Equal(40, conflictCount);

        // Verify class seat state: heldSeats = 10, availableSeats = 0
        var classStatus = await client.GetFromJsonAsync<ClassSeatStatusResponse>($"/classes/{createdClass.Id}");
        Assert.NotNull(classStatus);
        Assert.Equal(10, classStatus.TotalSeats);
        Assert.Equal(10, classStatus.HeldSeats);
        Assert.Equal(0, classStatus.ConfirmedSeats);
        Assert.Equal(0, classStatus.AvailableSeats);
    }

    [Fact]
    public async Task DuplicateApplication_SameStudentCannotHoldMoreThanOneSeatInSameClass()
    {
        // Arrange
        await using var factory = new TestWebApplicationFactory(holdDurationSeconds: 600);
        await factory.InitializeAsync();
        using var client = factory.CreateClient();

        var createRes = await client.PostAsJsonAsync("/classes", new { name = "Class 7 - Day Shift", totalSeats = 5 });
        var createdClass = await createRes.Content.ReadFromJsonAsync<CreateClassResponse>();
        Assert.NotNull(createdClass);

        var studentId = GenerateStudentId(101);

        // Act 1: First hold succeeds
        using var req1 = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        req1.Headers.Add("X-Student-Id", studentId);
        var res1 = await client.SendAsync(req1);
        Assert.Equal(HttpStatusCode.Created, res1.StatusCode);

        // Act 2: Second hold by the same student in the same class must return 409 Conflict (Rule 3)
        using var req2 = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        req2.Headers.Add("X-Student-Id", studentId);
        var res2 = await client.SendAsync(req2);
        Assert.Equal(HttpStatusCode.Conflict, res2.StatusCode);
    }

    [Fact]
    public async Task ConfirmHold_Idempotent_MultipleConfirmCallsIncrementConfirmedSeatsOnlyOnce()
    {
        // Arrange
        await using var factory = new TestWebApplicationFactory(holdDurationSeconds: 600);
        await factory.InitializeAsync();
        using var client = factory.CreateClient();

        var createRes = await client.PostAsJsonAsync("/classes", new { name = "Class 8 - Morning Shift", totalSeats = 5 });
        var createdClass = await createRes.Content.ReadFromJsonAsync<CreateClassResponse>();
        Assert.NotNull(createdClass);

        var studentId = GenerateStudentId(202);

        using var holdReq = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        holdReq.Headers.Add("X-Student-Id", studentId);
        var holdRes = await client.SendAsync(holdReq);
        var hold = await holdRes.Content.ReadFromJsonAsync<CreateHoldResponse>();
        Assert.NotNull(hold);

        // Act: Call POST /holds/{holdId}/confirm 3 times for the same hold (Rule 5)
        for (var i = 0; i < 3; i++)
        {
            using var confirmReq = new HttpRequestMessage(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm");
            confirmReq.Headers.Add("X-Student-Id", studentId);
            var confirmRes = await client.SendAsync(confirmReq);
            Assert.Equal(HttpStatusCode.OK, confirmRes.StatusCode);

            var confirmBody = await confirmRes.Content.ReadFromJsonAsync<ConfirmHoldResponse>();
            Assert.NotNull(confirmBody);
            Assert.Equal("CONFIRMED", confirmBody.Status);
        }

        // Assert: confirmedSeats is still 1, heldSeats is 0, availableSeats is 4
        var status = await client.GetFromJsonAsync<ClassSeatStatusResponse>($"/classes/{createdClass.Id}");
        Assert.NotNull(status);
        Assert.Equal(1, status.ConfirmedSeats);
        Assert.Equal(0, status.HeldSeats);
        Assert.Equal(4, status.AvailableSeats);
    }

    [Fact]
    public async Task HoldExpiration_SeatAutomaticallyReturnsToPoolWhenHoldDurationElapses()
    {
        // Arrange: Configure server with a 1-second hold duration (Rule 2)
        await using var factory = new TestWebApplicationFactory(holdDurationSeconds: 1);
        await factory.InitializeAsync();
        using var client = factory.CreateClient();

        var createRes = await client.PostAsJsonAsync("/classes", new { name = "Class 9 - Science", totalSeats = 1 });
        var createdClass = await createRes.Content.ReadFromJsonAsync<CreateClassResponse>();
        Assert.NotNull(createdClass);

        var student1 = GenerateStudentId(301);
        var student2 = GenerateStudentId(302);

        using var holdReq1 = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        holdReq1.Headers.Add("X-Student-Id", student1);
        var holdRes1 = await client.SendAsync(holdReq1);
        Assert.Equal(HttpStatusCode.Created, holdRes1.StatusCode);
        var hold1 = await holdRes1.Content.ReadFromJsonAsync<CreateHoldResponse>();
        Assert.NotNull(hold1);

        // Wait for hold to expire automatically
        await Task.Delay(TimeSpan.FromMilliseconds(1500));

        // Assert 1: Hold status is now EXPIRED
        var holdStatus = await client.GetFromJsonAsync<GetHoldResponse>($"/holds/{hold1.HoldId}");
        Assert.NotNull(holdStatus);
        Assert.Equal("EXPIRED", holdStatus.Status);

        // Assert 2: Seat is automatically back in availableSeats and Student 2 can now hold it
        using var holdReq2 = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        holdReq2.Headers.Add("X-Student-Id", student2);
        var holdRes2 = await client.SendAsync(holdReq2);
        Assert.Equal(HttpStatusCode.Created, holdRes2.StatusCode);
    }

    [Fact]
    public async Task InvalidInputs_Return4xxAndNever500()
    {
        // Arrange (Rule 7)
        await using var factory = new TestWebApplicationFactory(holdDurationSeconds: 600);
        await factory.InitializeAsync();
        using var client = factory.CreateClient();

        // 1. Empty class name -> 400
        var badClass1 = await client.PostAsJsonAsync("/classes", new { name = "", totalSeats = 50 });
        Assert.Equal(HttpStatusCode.BadRequest, badClass1.StatusCode);

        // 2. Zero or negative seats -> 400
        var badClass2 = await client.PostAsJsonAsync("/classes", new { name = "Class 10", totalSeats = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, badClass2.StatusCode);

        // 3. Invalid Student ID header (not 17 digits) -> 400
        using var badHoldReq = new HttpRequestMessage(HttpMethod.Post, "/classes/c_nonexistent/holds");
        badHoldReq.Headers.Add("X-Student-Id", "12345");
        var badHoldRes = await client.SendAsync(badHoldReq);
        Assert.Equal(HttpStatusCode.BadRequest, badHoldRes.StatusCode);
    }
}