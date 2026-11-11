# Author: Ammar Bin Mahmud <@abmprottoy>
# Project: Onnorokom School Admission Portal

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["src/OnnorokomAdmission.Api/OnnorokomAdmission.Api.csproj", "src/OnnorokomAdmission.Api/"]
RUN dotnet restore "src/OnnorokomAdmission.Api/OnnorokomAdmission.Api.csproj"

COPY . .
WORKDIR "/src/src/OnnorokomAdmission.Api"
RUN dotnet publish "OnnorokomAdmission.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "OnnorokomAdmission.Api.dll"]