/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: API Request and Response Data Transfer Objects (DTOs) according to the specification.
 */

using System.Text.Json.Serialization;

namespace OnnorokomAdmission.Api.Models;

public record CreateClassRequest(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("totalSeats")] int? TotalSeats
);

public record CreateClassResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("totalSeats")] int TotalSeats
);

public record ClassSeatStatusResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("totalSeats")] int TotalSeats,
    [property: JsonPropertyName("heldSeats")] int HeldSeats,
    [property: JsonPropertyName("confirmedSeats")] int ConfirmedSeats,
    [property: JsonPropertyName("availableSeats")] int AvailableSeats
);

public record CreateHoldResponse(
    [property: JsonPropertyName("holdId")] string HoldId,
    [property: JsonPropertyName("classId")] string ClassId,
    [property: JsonPropertyName("studentId")] string StudentId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("expiresAt")] string ExpiresAt
);

public record GetHoldResponse(
    [property: JsonPropertyName("holdId")] string HoldId,
    [property: JsonPropertyName("classId")] string ClassId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("expiresAt")] string ExpiresAt
);

public record ConfirmHoldResponse(
    [property: JsonPropertyName("holdId")] string HoldId,
    [property: JsonPropertyName("status")] string Status
);

public record MyHoldItemResponse(
    [property: JsonPropertyName("holdId")] string HoldId,
    [property: JsonPropertyName("classId")] string ClassId,
    [property: JsonPropertyName("className")] string ClassName,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("expiresAt")] string ExpiresAt
);

public record ApiErrorResponse(
    [property: JsonPropertyName("error")] string Error,
    [property: JsonPropertyName("message")] string Message
);