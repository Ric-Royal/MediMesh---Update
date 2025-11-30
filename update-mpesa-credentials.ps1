# M-Pesa Credentials Update Script
# This script helps you update your M-Pesa credentials safely

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "M-Pesa Credentials Update Helper" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Current Issue: 'Wrong credentials' error from M-Pesa API" -ForegroundColor Yellow
Write-Host ""

Write-Host "To fix this, you need valid Daraja sandbox credentials:" -ForegroundColor White
Write-Host ""
Write-Host "1. Go to: https://developer.safaricom.co.ke/" -ForegroundColor Gray
Write-Host "2. Login to your account" -ForegroundColor Gray
Write-Host "3. Go to 'My Apps'" -ForegroundColor Gray
Write-Host "4. Select your Sandbox app (or create new one)" -ForegroundColor Gray
Write-Host "5. Copy the credentials from the 'Keys' tab" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Enter Your Daraja Sandbox Credentials:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$consumerKey = Read-Host "Consumer Key"
$consumerSecret = Read-Host "Consumer Secret"
$passkey = Read-Host "Passkey (STK Push)"
$shortcode = Read-Host "Business Shortcode (press Enter for 174379)" 

if ([string]::IsNullOrWhiteSpace($shortcode)) {
    $shortcode = "174379"
}

Write-Host ""
Write-Host "Callback URL Setup:" -ForegroundColor Yellow
Write-Host "Do you have ngrok running? (Y/N)" -ForegroundColor White
$hasNgrok = Read-Host

$callbackUrl = "http://localhost:3001/api/payments/mpesa/callback"

if ($hasNgrok -eq "Y" -or $hasNgrok -eq "y") {
    $ngrokUrl = Read-Host "Enter your ngrok HTTPS URL (e.g., https://abc123.ngrok.io)"
    $callbackUrl = "$ngrokUrl/api/payments/mpesa/callback"
}

Write-Host ""
Write-Host "Updating .env file..." -ForegroundColor Yellow

# Read current .env
$envContent = Get-Content .env

# Update M-Pesa variables
$newEnvContent = @()
foreach ($line in $envContent) {
    if ($line -match "^MPESA_CONSUMER_KEY=") {
        $newEnvContent += "MPESA_CONSUMER_KEY=$consumerKey"
    }
    elseif ($line -match "^MPESA_CONSUMER_SECRET=") {
        $newEnvContent += "MPESA_CONSUMER_SECRET=$consumerSecret"
    }
    elseif ($line -match "^MPESA_PASSKEY=") {
        $newEnvContent += "MPESA_PASSKEY=$passkey"
    }
    elseif ($line -match "^MPESA_SHORTCODE=") {
        $newEnvContent += "MPESA_SHORTCODE=$shortcode"
    }
    elseif ($line -match "^MPESA_CALLBACK_URL=") {
        $newEnvContent += "MPESA_CALLBACK_URL=$callbackUrl"
    }
    else {
        $newEnvContent += $line
    }
}

# Write back to .env
$newEnvContent | Out-File -FilePath .env -Encoding UTF8

Write-Host "SUCCESS: .env file updated!" -ForegroundColor Green
Write-Host ""
Write-Host "New M-Pesa Configuration:" -ForegroundColor Cyan
Write-Host "  - Consumer Key: $($consumerKey.Substring(0, [Math]::Min(20, $consumerKey.Length)))..." -ForegroundColor Gray
Write-Host "  - Consumer Secret: $($consumerSecret.Substring(0, [Math]::Min(20, $consumerSecret.Length)))..." -ForegroundColor Gray
Write-Host "  - Shortcode: $shortcode" -ForegroundColor Gray
Write-Host "  - Callback URL: $callbackUrl" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Restart patient-api container:" -ForegroundColor White
Write-Host "   docker-compose restart patient-api" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Wait 10 seconds for container to restart" -ForegroundColor White
Write-Host ""
Write-Host "3. Test payment again in the frontend" -ForegroundColor White
Write-Host "   http://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Use sandbox test number: 254708374149" -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "Configuration Updated Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

