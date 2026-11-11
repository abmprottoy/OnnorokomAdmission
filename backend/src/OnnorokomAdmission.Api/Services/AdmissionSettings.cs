/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: Configuration settings for hold duration and environment variables.
 */

namespace OnnorokomAdmission.Api.Services;

public class AdmissionSettings
{
    public int HoldDurationSeconds { get; init; } = 600;
}