# MediMesh Patient Lifecycle Testing Script

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MediMesh Patient Lifecycle Testing" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login
Write-Host "[STEP 1] Testing Login..." -ForegroundColor Yellow
$loginBody = @{
    username = 'admin'
    password = 'admin123'
} | ConvertTo-Json

try {
    $loginResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -UseBasicParsing -TimeoutSec 10
    $loginData = $loginResponse.Content | ConvertFrom-Json
    $token = $loginData.access_token
    Write-Host "SUCCESS: Login Successful!" -ForegroundColor Green
    Write-Host "  User: $($loginData.user.name)" -ForegroundColor Gray
    Write-Host "  Roles: $($loginData.user.roles -join ', ')" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: Login Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Setup headers
$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type' = 'application/json'
}

# Step 2: Register a new patient
Write-Host "[STEP 2] Registering New Patient (James Mwangi)..." -ForegroundColor Yellow
$patientBody = @{
    firstName = 'James'
    lastName = 'Mwangi'
    dateOfBirth = '1985-03-15'
    gender = 'Male'
    phone = '0712345678'
    idNumber = '12345678'
    address = '123 Nairobi Road'
} | ConvertTo-Json

try {
    $patientResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/patients" -Method Post -Body $patientBody -Headers $headers -UseBasicParsing -TimeoutSec 10
    $patientData = $patientResponse.Content | ConvertFrom-Json
    $patientId = $patientData.id
    Write-Host "SUCCESS: Patient Registered!" -ForegroundColor Green
    Write-Host "  Patient ID: $patientId" -ForegroundColor Gray
    Write-Host "  Name: $($patientData.firstName) $($patientData.lastName)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: Patient Registration Failed: $($_.Exception.Message)" -ForegroundColor Red
    if($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        Write-Host "  Response: $($reader.ReadToEnd())" -ForegroundColor Red
    }
    $patientId = $null
}
Write-Host ""

# Step 3: Fetch Clinics (needed for creating encounters)
Write-Host "[STEP 3] Fetching Available Clinics..." -ForegroundColor Yellow
try {
    $clinicsResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/clinics" -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 10
    $clinics = $clinicsResponse.Content | ConvertFrom-Json
    if ($clinics.Count -gt 0) {
        $clinicId = $clinics[0].id
        Write-Host "SUCCESS: Found $($clinics.Count) clinics" -ForegroundColor Green
        Write-Host "  Using Clinic: $($clinics[0].name)" -ForegroundColor Gray
    } else {
        Write-Host "WARNING: No clinics found" -ForegroundColor Yellow
        $clinicId = $null
    }
} catch {
    Write-Host "FAILED: Could not fetch clinics: $($_.Exception.Message)" -ForegroundColor Red
    $clinicId = $null
}
Write-Host ""

# Step 4: Fetch Staff/Doctors (needed for creating encounters)
Write-Host "[STEP 4] Fetching Available Staff..." -ForegroundColor Yellow
try {
    $staffResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/staff" -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 10
    $staff = $staffResponse.Content | ConvertFrom-Json
    if ($staff.Count -gt 0) {
        $doctorId = $staff[0].id
        Write-Host "SUCCESS: Found $($staff.Count) staff members" -ForegroundColor Green
        Write-Host "  Using Doctor: $($staff[0].name)" -ForegroundColor Gray
    } else {
        Write-Host "WARNING: No staff found" -ForegroundColor Yellow
        $doctorId = $null
    }
} catch {
    Write-Host "FAILED: Could not fetch staff: $($_.Exception.Message)" -ForegroundColor Red
    $doctorId = $null
}
Write-Host ""

# Step 5: Create an Encounter/Visit
if ($patientId -and $clinicId -and $doctorId) {
    Write-Host "[STEP 5] Creating Encounter/Visit for Patient..." -ForegroundColor Yellow
    $encounterBody = @{
        patientId = $patientId
        clinicId = $clinicId
        doctorId = $doctorId
        encounterType = 'outpatient'
        chiefComplaint = 'Regular checkup'
    } | ConvertTo-Json

    try {
        $encounterResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/encounters" -Method Post -Body $encounterBody -Headers $headers -UseBasicParsing -TimeoutSec 10
        $encounterData = $encounterResponse.Content | ConvertFrom-Json
        $encounterId = $encounterData.id
        Write-Host "SUCCESS: Encounter Created!" -ForegroundColor Green
        Write-Host "  Encounter ID: $encounterId" -ForegroundColor Gray
    } catch {
        Write-Host "FAILED: Encounter Creation Failed: $($_.Exception.Message)" -ForegroundColor Red
        if($_.Exception.Response) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            Write-Host "  Response: $($reader.ReadToEnd())" -ForegroundColor Red
        }
    }
    Write-Host ""
} else {
    Write-Host "[STEP 5] SKIPPED: Cannot create encounter (missing patient, clinic, or doctor)" -ForegroundColor Yellow
    Write-Host ""
}

# Step 6: Check Queue
Write-Host "[STEP 6] Checking Consultation Queue..." -ForegroundColor Yellow
try {
    $queueResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/queue" -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 10
    $queue = $queueResponse.Content | ConvertFrom-Json
    Write-Host "SUCCESS: Retrieved queue" -ForegroundColor Green
    Write-Host "  Queue entries: $($queue.Count)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: Could not fetch queue: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 7: Check Appointments
Write-Host "[STEP 7] Checking Appointments..." -ForegroundColor Yellow
try {
    $appointmentsResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/appointments" -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 10
    $appointments = $appointmentsResponse.Content | ConvertFrom-Json
    Write-Host "SUCCESS: Retrieved appointments" -ForegroundColor Green
    Write-Host "  Appointments: $($appointments.Count)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: Could not fetch appointments: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 8: Check Pharmacy
Write-Host "[STEP 8] Checking Pharmacy..." -ForegroundColor Yellow
try {
    $pharmacyResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/pharmacy/prescriptions" -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 10
    $prescriptions = $pharmacyResponse.Content | ConvertFrom-Json
    Write-Host "SUCCESS: Retrieved pharmacy data" -ForegroundColor Green
    Write-Host "  Prescriptions: $($prescriptions.Count)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: Could not fetch pharmacy data: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 9: Check Laboratory
Write-Host "[STEP 9] Checking Laboratory..." -ForegroundColor Yellow
try {
    $labResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/lab/orders" -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 10
    $labOrders = $labResponse.Content | ConvertFrom-Json
    Write-Host "SUCCESS: Retrieved lab data" -ForegroundColor Green
    Write-Host "  Lab orders: $($labOrders.Count)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: Could not fetch lab data: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 10: Check Radiology
Write-Host "[STEP 10] Checking Radiology..." -ForegroundColor Yellow
try {
    $radiologyResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/radiology/orders" -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 10
    $radiologyOrders = $radiologyResponse.Content | ConvertFrom-Json
    Write-Host "SUCCESS: Retrieved radiology data" -ForegroundColor Green
    Write-Host "  Radiology orders: $($radiologyOrders.Count)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: Could not fetch radiology data: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 11: Check Billing
Write-Host "[STEP 11] Checking Billing..." -ForegroundColor Yellow
try {
    $billingResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/billing/invoices" -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 10
    $invoices = $billingResponse.Content | ConvertFrom-Json
    Write-Host "SUCCESS: Retrieved billing data" -ForegroundColor Green
    Write-Host "  Invoices: $($invoices.Count)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: Could not fetch billing data: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 12: Check Wards
Write-Host "[STEP 12] Checking Wards..." -ForegroundColor Yellow
try {
    $wardsResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/wards" -Method Get -Headers $headers -UseBasicParsing -TimeoutSec 10
    $wards = $wardsResponse.Content | ConvertFrom-Json
    Write-Host "SUCCESS: Retrieved wards data" -ForegroundColor Green
    Write-Host "  Wards: $($wards.Count)" -ForegroundColor Gray
} catch {
    Write-Host "FAILED: Could not fetch wards data: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
