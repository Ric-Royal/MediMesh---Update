param(
    [string]$BaseUrl = 'http://localhost:3000',
    [string]$Username = 'admin'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$passwordPath = Join-Path $repositoryRoot 'secrets/bootstrap_admin_password.txt'

if (-not (Test-Path -LiteralPath $passwordPath)) {
    throw 'Local secrets are missing. Run scripts/Initialize-LocalSecrets.ps1 first.'
}

$password = (Get-Content -Raw -LiteralPath $passwordPath).Trim()
$loginBody = @{ username = $Username; password = $password } | ConvertTo-Json
$login = Invoke-RestMethod `
    -Uri "$BaseUrl/api/auth/login" `
    -Method Post `
    -ContentType 'application/json' `
    -Body $loginBody `
    -SessionVariable webSession

if ($login.access_token) {
    throw 'The login response exposed a bearer token.'
}
if ($login.token_type -ne 'Cookie') {
    throw 'The server did not establish a cookie session.'
}

$meResponse = Invoke-RestMethod `
    -Uri "$BaseUrl/api/auth/me" `
    -Method Get `
    -WebSession $webSession
if ($meResponse.username -ne $Username) {
    throw 'The authenticated identity did not match the requested account.'
}

$csrfCookie = $webSession.Cookies.GetCookies([Uri]$BaseUrl)['medimesh_csrf']
if (-not $csrfCookie) {
    throw 'The anti-CSRF cookie was not issued.'
}

function Assert-HttpStatus {
    param(
        [string]$Uri,
        [int]$ExpectedStatus
    )

    try {
        Invoke-WebRequest -Uri $Uri -Method Get -WebSession $webSession -UseBasicParsing | Out-Null
        throw "Expected HTTP $ExpectedStatus from $Uri."
    } catch {
        if (-not $_.Exception.Response -or $_.Exception.Response.StatusCode.value__ -ne $ExpectedStatus) {
            throw
        }
    }
}

Assert-HttpStatus -Uri "$BaseUrl/api/appointments?limit=1000" -ExpectedStatus 400
Assert-HttpStatus -Uri "$BaseUrl/api/schedules/not-a-uuid" -ExpectedStatus 400
Assert-HttpStatus -Uri "$BaseUrl/api/wards/not-a-uuid/occupancy" -ExpectedStatus 400

$csrfRejected = $false
try {
    Invoke-RestMethod `
        -Uri "$BaseUrl/api/auth/logout" `
        -Method Post `
        -WebSession $webSession | Out-Null
} catch {
    $csrfRejected = $_.Exception.Response.StatusCode.value__ -eq 403
}
if (-not $csrfRejected) {
    throw 'A state-changing request without the anti-CSRF header was not rejected.'
}

Invoke-RestMethod `
    -Uri "$BaseUrl/api/auth/logout" `
    -Method Post `
    -WebSession $webSession `
    -Headers @{ 'X-CSRF-Token' = $csrfCookie.Value } | Out-Null

Write-Host 'Secure preview checks passed: cookie session, no bearer token, identity check, strict route validation, CSRF rejection, and logout.'
