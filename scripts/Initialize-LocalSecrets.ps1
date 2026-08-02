param(
    [switch]$Rotate
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $repositoryRoot 'secrets'
[System.IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function New-RandomBase64Url([int]$ByteCount) {
    $bytes = [byte[]]::new($ByteCount)
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-RandomBase64([int]$ByteCount) {
    $bytes = [byte[]]::new($ByteCount)
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function Set-Secret([string]$Name, [string]$Value) {
    $path = Join-Path $secretDirectory "$Name.txt"
    if ($Rotate -or -not (Test-Path -LiteralPath $path)) {
        [System.IO.File]::WriteAllText($path, $Value, $utf8NoBom)
    }
}

Set-Secret 'db_admin_password' ("Db9!" + (New-RandomBase64Url 30))
Set-Secret 'app_db_password' ("App9!" + (New-RandomBase64Url 30))
Set-Secret 'redis_password' ("Redis9!" + (New-RandomBase64Url 30))
Set-Secret 'jwt_secret' (New-RandomBase64Url 48)
Set-Secret 'mfa_encryption_key' (New-RandomBase64 32)
Set-Secret 'file_encryption_key' (New-RandomBase64 32)
Set-Secret 'bootstrap_admin_password' ("Mm9!" + (New-RandomBase64Url 24))
Set-Secret 'minio_root_user' ("root" + (New-RandomBase64Url 9))
Set-Secret 'minio_root_password' ("Root9!" + (New-RandomBase64Url 30))
Set-Secret 'minio_app_user' ("app" + (New-RandomBase64Url 9))
Set-Secret 'minio_app_password' ("Store9!" + (New-RandomBase64Url 30))
Set-Secret 'mpesa_callback_token' (New-RandomBase64Url 48)

Write-Host "Local runtime secrets are ready in the ignored secrets directory."
Write-Host "Use -Rotate to replace every local runtime secret."
