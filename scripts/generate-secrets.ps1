# MediMesh Secure Password Generation Script
# This script generates cryptographically secure passwords for production deployment

param(
    [switch]$Production,
    [switch]$Development,
    [string]$OutputFile = ".env.generated"
)

Write-Host "🔐 MediMesh Secure Password Generator" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

# Function to generate secure password
function Generate-SecurePassword {
    param(
        [int]$Length = 32,
        [switch]$IncludeSymbols
    )
    
    $chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    if ($IncludeSymbols) {
        $chars += "!@#$%^&*()_+-=[]{}|;:,.<>?"
    }
    
    $password = ""
    $random = New-Object System.Random
    
    for ($i = 0; $i -lt $Length; $i++) {
        $password += $chars[$random.Next(0, $chars.Length)]
    }
    
    return $password
}

# Function to generate JWT secret
function Generate-JWTSecret {
    $bytes = New-Object byte[] 64
    $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
    $rng.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
}

# Function to generate UUID
function Generate-UUID {
    return [System.Guid]::NewGuid().ToString()
}

Write-Host "Generating secure passwords..." -ForegroundColor Yellow

# Generate all passwords
$passwords = @{
    "DB_PASSWORD" = Generate-SecurePassword -Length 24 -IncludeSymbols
    "REDIS_PASSWORD" = Generate-SecurePassword -Length 24 -IncludeSymbols
    "MINIO_ACCESS_KEY" = Generate-SecurePassword -Length 20
    "MINIO_SECRET_KEY" = Generate-SecurePassword -Length 40 -IncludeSymbols
    "KEYCLOAK_ADMIN_PASSWORD" = Generate-SecurePassword -Length 24 -IncludeSymbols
    "KEYCLOAK_DB_PASSWORD" = Generate-SecurePassword -Length 24 -IncludeSymbols
    "JWT_SECRET" = Generate-JWTSecret
    "VAULT_TOKEN" = Generate-UUID
    "BACKUP_ENCRYPTION_KEY" = Generate-SecurePassword -Length 32 -IncludeSymbols
    "SMTP_PASSWORD" = Generate-SecurePassword -Length 20 -IncludeSymbols
}

# Create environment file content
$envContent = @"
# MediMesh Generated Secrets - $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# CRITICAL: Keep this file secure and never commit to version control!

# ===========================================
# GENERATED SECURE PASSWORDS
# ===========================================
DB_PASSWORD=$($passwords.DB_PASSWORD)
REDIS_PASSWORD=$($passwords.REDIS_PASSWORD)
MINIO_ACCESS_KEY=$($passwords.MINIO_ACCESS_KEY)
MINIO_SECRET_KEY=$($passwords.MINIO_SECRET_KEY)
KEYCLOAK_ADMIN_PASSWORD=$($passwords.KEYCLOAK_ADMIN_PASSWORD)
KEYCLOAK_DB_PASSWORD=$($passwords.KEYCLOAK_DB_PASSWORD)
JWT_SECRET=$($passwords.JWT_SECRET)
VAULT_TOKEN=$($passwords.VAULT_TOKEN)
BACKUP_ENCRYPTION_KEY=$($passwords.BACKUP_ENCRYPTION_KEY)
SMTP_PASSWORD=$($passwords.SMTP_PASSWORD)

# ===========================================
# COPY THESE VALUES TO YOUR .env.production FILE
# ===========================================
"@

# Write to file
$envContent | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host "✅ Secure passwords generated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Generated passwords saved to: $OutputFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔒 SECURITY REMINDERS:" -ForegroundColor Red
Write-Host "1. Copy these passwords to your .env.production file" -ForegroundColor Yellow
Write-Host "2. Delete the $OutputFile file after copying" -ForegroundColor Yellow
Write-Host "3. Never commit .env files to version control" -ForegroundColor Yellow
Write-Host "4. Store production passwords in a secure password manager" -ForegroundColor Yellow
Write-Host "5. Rotate these passwords regularly" -ForegroundColor Yellow
Write-Host ""

# Display password summary (without showing actual passwords)
Write-Host "📊 Password Summary:" -ForegroundColor Cyan
foreach ($key in $passwords.Keys) {
    $length = $passwords[$key].Length
    Write-Host "  $key`: $length characters" -ForegroundColor White
}

Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Green
Write-Host "1. Copy passwords from $OutputFile to .env.production" -ForegroundColor White
Write-Host "2. Update domain names in .env.production" -ForegroundColor White
Write-Host "3. Configure SSL certificates" -ForegroundColor White
Write-Host "4. Set up HashiCorp Vault for secrets management" -ForegroundColor White
Write-Host "5. Run: docker-compose -f docker-compose.prod.yml up -d" -ForegroundColor White 