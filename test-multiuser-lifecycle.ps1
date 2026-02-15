# =====================================================================
# MediMesh Multi-User Patient Lifecycle Simulation
# =====================================================================
# Simulates a real hospital workflow where DIFFERENT staff members
# handle different stages of the patient journey:
#
#   RECEPTIONIST (Alice Taylor, REC001) -> Registration & Appointment
#   NURSE (Mary Johnson, NUR001)        -> Check-in, Triage, Queue
#   DOCTOR (James Anderson, DOC001)     -> Consultation, Orders
#   LAB TECH (David Garcia, LAB001)     -> Sample collection, Results
#   PHARMACIST (Thomas White, PHAR001)  -> Drug dispensing
#   BILLING (Susan Moore, REC002)       -> Invoice finalize, Payment
#
# Uses dev_token_<role>_<staffId> pattern for staff-specific auth
# =====================================================================

$API = "http://localhost:3001/api"
$ErrorActionPreference = "Continue"

# =====================================================================
# STAFF ROSTER - Each station has a named person
# =====================================================================
$Staff = @{
    # Reception desk
    Receptionist = @{
        Name = "Alice Taylor (REC001)"
        Role = "receptionist"
        Id   = "6d597381-5453-44f5-b04b-c78fe3b4ae94"
        Token = "dev_token_receptionist_6d597381-5453-44f5-b04b-c78fe3b4ae94"
    }
    # Billing clerk (second receptionist)
    BillingClerk = @{
        Name = "Susan Moore (REC002)"
        Role = "receptionist"
        Id   = "ef409a8e-7254-4b5b-9d5c-71ea318067a3"
        Token = "dev_token_receptionist_ef409a8e-7254-4b5b-9d5c-71ea318067a3"
    }
    # Triage nurse
    Nurse = @{
        Name = "Mary Johnson (NUR001)"
        Role = "nurse"
        Id   = "248031b7-5c75-4ace-af51-bc351ee48a65"
        Token = "dev_token_nurse_248031b7-5c75-4ace-af51-bc351ee48a65"
    }
    # Consulting doctor - General Medicine
    DoctorGM = @{
        Name = "Dr. James Anderson (DOC001)"
        Role = "doctor"
        Id   = "21a897fd-0c43-41c1-8448-f70df0ee6a65"
        Token = "dev_token_doctor_21a897fd-0c43-41c1-8448-f70df0ee6a65"
    }
    # Consulting doctor - Cardiology
    DoctorCard = @{
        Name = "Dr. Robert Chen (DOC003)"
        Role = "doctor"
        Id   = "dfa66eb9-10c8-4339-9658-34fa7df572f6"
        Token = "dev_token_doctor_dfa66eb9-10c8-4339-9658-34fa7df572f6"
    }
    # Lab technician - Clinical Chemistry
    LabTech = @{
        Name = "David Garcia (LAB001)"
        Role = "lab-tech"
        Id   = "acd67ee6-7494-4350-95de-d1dedc0fbaaa"
        Token = "dev_token_labtech_acd67ee6-7494-4350-95de-d1dedc0fbaaa"
    }
    # Lab technician - Hematology
    LabTech2 = @{
        Name = "Jennifer Lee (LAB002)"
        Role = "lab-tech"
        Id   = "7b608ab1-3b64-41d0-b27a-33e355345f48"
        Token = "dev_token_labtech_7b608ab1-3b64-41d0-b27a-33e355345f48"
    }
    # Pharmacist
    Pharmacist = @{
        Name = "Thomas White (PHAR001)"
        Role = "pharmacist"
        Id   = "b8187c90-594f-4e8c-a008-f5386a6c8894"
        Token = "dev_token_pharma_b8187c90-594f-4e8c-a008-f5386a6c8894"
    }
}

# =====================================================================
# HELPERS
# =====================================================================
function Get-Headers($staffEntry) {
    return @{
        'Authorization' = "Bearer $($staffEntry.Token)"
        'Content-Type'  = 'application/json'
    }
}

function Invoke-Api {
    param([string]$Method, [string]$Url, [object]$Body, [hashtable]$Headers)
    try {
        $params = @{ Uri = $Url; Method = $Method; Headers = $Headers; UseBasicParsing = $true; TimeoutSec = 15; ContentType = "application/json" }
        if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 5) }
        $resp = Invoke-WebRequest @params
        return ($resp.Content | ConvertFrom-Json)
    } catch {
        $err = ""
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $err = $_.ErrorDetails.Message }
        elseif ($_.Exception.Response) {
            try { $s = $_.Exception.Response.GetResponseStream(); $r = [System.IO.StreamReader]::new($s); $err = $r.ReadToEnd(); $r.Close(); $s.Close() } catch {}
        }
        if ($err) { Write-Host "    ERROR: $err" -ForegroundColor Red }
        else { Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red }
        return $null
    }
}

function Get-Id($r) {
    if ($r.data -and $r.data.id) { return $r.data.id }
    elseif ($r.id) { return $r.id }
    return $null
}

function Show-Station([string]$icon, [string]$station, [string]$staffName) {
    Write-Host ""
    Write-Host "  $icon  $station" -ForegroundColor Cyan
    Write-Host "     Staff: $staffName" -ForegroundColor DarkGray
    Write-Host "     " + ("-" * 50) -ForegroundColor DarkGray
}

$tomorrow = (Get-Date).AddDays(3).ToString("yyyy-MM-dd")
$nextWeek = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
$rndMin = Get-Random -Minimum 0 -Maximum 59

# =====================================================================
# FETCH REFERENCE DATA (using admin token from login)
# =====================================================================
Write-Host "`n" -NoNewline
Write-Host "================================================================" -ForegroundColor White
Write-Host "  MEDIMESH - Multi-User Hospital Workflow Simulation" -ForegroundColor White
Write-Host "  Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White

Write-Host "`n  Loading reference data..." -ForegroundColor DarkGray
$login = Invoke-Api -Method Post -Url "$API/auth/login" -Body @{ username='admin'; password='admin123' } -Headers @{'Content-Type'='application/json'}
$adminH = @{ 'Authorization' = "Bearer $($login.access_token)"; 'Content-Type' = 'application/json' }

$clinics = (Invoke-Api -Method Get -Url "$API/clinics" -Headers $adminH).data
$labTests = (Invoke-Api -Method Get -Url "$API/lab/tests" -Headers $adminH).data
$drugs = (Invoke-Api -Method Get -Url "$API/pharmacy/drugs" -Headers $adminH).data
$radTests = (Invoke-Api -Method Get -Url "$API/radiology/tests" -Headers $adminH).data

$clinicGM = ($clinics | Where-Object { $_.clinic_name -like '*Anderson*' })[0]
$clinicCard = ($clinics | Where-Object { $_.clinic_name -like '*Cardiology*' })[0]
if (-not $clinicGM) { $clinicGM = $clinics[0] }
if (-not $clinicCard) { $clinicCard = $clinics[0] }

Write-Host "  Ready: $($clinics.Count) clinics, $($labTests.Count) lab tests, $($drugs.Count) drugs, $($radTests.Count) radiology tests" -ForegroundColor DarkGray

# =====================================================================
# PATIENT A: Grace Muthoni - Full Lifecycle (Gen. Medicine)
# Reception -> Nurse -> Doctor -> Lab -> Pharmacy -> Billing
# =====================================================================
Write-Host "`n================================================================" -ForegroundColor Green
Write-Host "  PATIENT A: Grace Muthoni" -ForegroundColor Green
Write-Host "  Full lifecycle through General Medicine" -ForegroundColor Green
Write-Host "  Chief Complaint: Fatigue, weight loss, frequent urination" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

# --- RECEPTION DESK (Alice Taylor) ---
Show-Station "1." "RECEPTION DESK" $Staff.Receptionist.Name
$recH = Get-Headers $Staff.Receptionist

Write-Host "     Registering new patient..." -ForegroundColor Yellow
$pA = Invoke-Api -Method Post -Url "$API/patients" -Body @{
    first_name = 'Grace'; last_name = 'Muthoni'
    date_of_birth = '1990-04-12'; gender = 'F'
    phone = '0745123456'; email = 'grace.muthoni@email.com'
    address = @{ street = '23 Ngong Road'; city = 'Nairobi'; county = 'Nairobi'; country = 'Kenya' }
    emergency_contact_name = 'Peter Muthoni'; emergency_contact_phone = '0722111222'
} -Headers $recH
$pAId = Get-Id $pA
if ($pAId) { Write-Host "     Patient registered: $pAId" -ForegroundColor Green }

Write-Host "     Booking appointment with Dr. Anderson (General Medicine)..." -ForegroundColor Yellow
$apptA = Invoke-Api -Method Post -Url "$API/appointments" -Body @{
    patient_id = $pAId; appointment_type = 'consultation'
    scheduled_date = $tomorrow; scheduled_time = "08:{0:D2}" -f $rndMin
    duration_minutes = 30; doctor_id = $Staff.DoctorGM.Id; clinic_id = $clinicGM.id
    reason_for_visit = 'Fatigue, unexplained weight loss, frequent urination for 3 weeks'
    payment_type = 'self-pay'
} -Headers $recH
$apptAId = Get-Id $apptA
if ($apptAId) {
    Write-Host "     Appointment booked: $($apptA.data.appointment_number)" -ForegroundColor Green
    
    Write-Host "     Confirming appointment..." -ForegroundColor Yellow
    $conf = Invoke-Api -Method Post -Url "$API/appointments/$apptAId/confirm" -Headers $recH
    if ($conf.success) { Write-Host "     Appointment confirmed" -ForegroundColor Green }
}

# --- NURSE TRIAGE STATION (Mary Johnson) ---
Show-Station "2." "NURSE TRIAGE STATION" $Staff.Nurse.Name
$nurH = Get-Headers $Staff.Nurse

Write-Host "     Checking patient in..." -ForegroundColor Yellow
if ($apptAId) {
    $ci = Invoke-Api -Method Post -Url "$API/appointments/$apptAId/check-in" -Headers $nurH
    if ($ci.success) { Write-Host "     Patient checked in at triage desk" -ForegroundColor Green }
}

Write-Host "     Creating encounter (triage assessment)..." -ForegroundColor Yellow
$encA = Invoke-Api -Method Post -Url "$API/encounters" -Body @{
    patientId = $pAId; clinicId = $clinicGM.id; doctorId = $Staff.DoctorGM.Id
    encounterType = 'outpatient'
    chiefComplaint = 'Fatigue, weight loss (5kg in 3 weeks), polyuria, polydipsia'
    triageLevel = 'urgent'
    paymentType = 'self-pay'
} -Headers $nurH
$encAId = Get-Id $encA
if ($encAId) {
    Write-Host "     Encounter created: $($encA.data.encounter_number)" -ForegroundColor Green
    Write-Host "     Triage level: URGENT (suspected new-onset diabetes)" -ForegroundColor Yellow
}

# --- DOCTOR'S CONSULTING ROOM (Dr. James Anderson) ---
Show-Station "3." "DOCTOR'S CONSULTING ROOM" $Staff.DoctorGM.Name
$docH = Get-Headers $Staff.DoctorGM

$labItems = @()
if ($labTests.Count -ge 3) {
    $labItems = @(
        @{ testId = $labTests[0].id; priority = 'urgent'; price = if($labTests[0].price){[decimal]$labTests[0].price}else{500} },
        @{ testId = $labTests[1].id; priority = 'urgent'; price = if($labTests[1].price){[decimal]$labTests[1].price}else{300} },
        @{ testId = $labTests[2].id; priority = 'urgent'; price = if($labTests[2].price){[decimal]$labTests[2].price}else{800} }
    )
}

$rxItems = @()
if ($drugs.Count -ge 2) {
    $rxItems = @(
        @{ drugId = $drugs[0].id; dosage = '500mg'; frequency = 'TDS'; duration = '7'; quantity = 21
           instructions = 'Take after meals with plenty of water'; unitPrice = 40; totalPrice = 840 },
        @{ drugId = $drugs[1].id; dosage = '1000mg'; frequency = 'BD'; duration = '14'; quantity = 28
           instructions = 'Take with breakfast and dinner'; unitPrice = 25; totalPrice = 700 }
    )
}

Write-Host "     Conducting consultation..." -ForegroundColor Yellow
Write-Host "     Recording vitals, history, examination..." -ForegroundColor DarkGray
$consA = Invoke-Api -Method Post -Url "$API/consultations" -Body @{
    encounterId = $encAId; patientId = $pAId; doctorId = $Staff.DoctorGM.Id
    vitals = @{
        bloodPressure = '128/82'; temperature = 37.1; pulse = 88
        respiratoryRate = 18; oxygenSaturation = 98; weight = 62; height = 165; bmi = 22.8
    }
    chiefComplaint = 'Fatigue, weight loss 5kg in 3 weeks, polyuria, polydipsia'
    historyPresentIllness = 'Patient reports excessive thirst (3-4L/day), frequent urination (8-10x/day including nocturia x3), unintentional weight loss of 5kg, and progressive fatigue over 3 weeks'
    pastMedicalHistory = 'No significant PMH. No previous surgeries.'
    familyHistory = 'Mother: Type 2 DM diagnosed at 55. Father: Hypertension.'
    socialHistory = 'Non-smoker, occasional social alcohol, office worker'
    allergies = 'NKDA'
    currentMedications = 'None'
    examination = @{
        generalAppearance = 'Alert, thin build, dry mucous membranes'
        cardiovascular = 'S1S2 normal, no murmurs. BP 128/82 both arms'
        respiratory = 'Clear bilateral air entry, no added sounds'
        abdominal = 'Soft, non-tender, no organomegaly'
        neurological = 'GCS 15/15, cranial nerves intact, peripheral sensation intact'
        skin = 'Dry skin, reduced turgor. No acanthosis nigricans'
        other = 'BMI 22.8, mild dehydration signs'
    }
    provisionalDiagnosis = 'New-onset Diabetes Mellitus (likely Type 2, rule out Type 1)'
    differentialDiagnosis = 'Type 1 DM, Type 2 DM, Thyrotoxicosis, Malignancy'
    finalDiagnosis = 'Type 2 Diabetes Mellitus - new diagnosis'
    treatmentPlan = 'Urgent fasting blood glucose and HbA1c. Start Metformin 500mg TDS. Diabetic education. Refer to dietitian.'
    followUpInstructions = 'Return in 1 week with lab results. Fasting state required for blood draw.'
    labOrders = $labItems
    radiologyOrders = @()
    prescriptions = $rxItems
} -Headers $docH

if ($consA.success) {
    Write-Host "     Consultation completed" -ForegroundColor Green
    Write-Host "     Diagnosis: Type 2 Diabetes Mellitus - new diagnosis" -ForegroundColor White
    Write-Host "     Orders placed:" -ForegroundColor DarkGray
    if ($consA.data.orders.labOrders.Count -gt 0) {
        Write-Host "       LAB: $($consA.data.orders.labOrders[0].orderNumber) ($($labItems.Count) tests - URGENT)" -ForegroundColor Magenta
    }
    if ($consA.data.orders.prescriptions.Count -gt 0) {
        Write-Host "       RX:  $($consA.data.orders.prescriptions[0].prescriptionNumber) ($($rxItems.Count) medications)" -ForegroundColor Magenta
    }
    Write-Host "     Patient directed to: Laboratory -> then Pharmacy" -ForegroundColor Yellow
}

# --- LABORATORY (David Garcia, Lab Tech) ---
Show-Station "4." "LABORATORY" $Staff.LabTech.Name
$labH = Get-Headers $Staff.LabTech

$labOrds = Invoke-Api -Method Get -Url "$API/lab/orders?patient_id=$pAId" -Headers $labH
$labOrdList = @($labOrds.data)
if ($labOrdList.Count -gt 0) {
    $lo = $labOrdList[0]
    Write-Host "     Receiving lab order: $($lo.order_number) (URGENT)" -ForegroundColor Yellow
    Write-Host "     Collecting blood sample (venipuncture, right antecubital fossa)..." -ForegroundColor DarkGray
    
    Invoke-Api -Method Put -Url "$API/lab/orders/$($lo.id)/status" -Body @{ status = 'sample-collected' } -Headers $labH | Out-Null
    Write-Host "     Sample collected, labelled, sent to analyzer" -ForegroundColor Green
    
    Write-Host "     Processing samples..." -ForegroundColor DarkGray
    Invoke-Api -Method Put -Url "$API/lab/orders/$($lo.id)/status" -Body @{ status = 'in-progress' } -Headers $labH | Out-Null

    # Get order details for result entry
    $labDet = Invoke-Api -Method Get -Url "$API/lab/orders/$($lo.id)" -Headers $labH
    $results = @(
        @{ value = '14.2'; unit = 'mmol/L'; notes = 'CRITICALLY HIGH - Fasting glucose'; refMin = '3.9'; refMax = '5.6' },
        @{ value = '9.8'; unit = '%'; notes = 'HIGH - Indicates poor glycemic control >3 months'; refMin = '4.0'; refMax = '5.6' },
        @{ value = '285'; unit = 'mg/dL'; notes = 'HIGH - Random glucose confirms hyperglycemia'; refMin = '70'; refMax = '140' }
    )
    
    if ($labDet.data -and $labDet.data.items) {
        $i = 0
        foreach ($item in $labDet.data.items) {
            $r = if ($i -lt $results.Count) { $results[$i] } else { $results[0] }
            Invoke-Api -Method Post -Url "$API/lab/orders/$($lo.id)/items/$($item.id)/result" -Body @{
                result_value = $r.value; result_unit = $r.unit; result_notes = $r.notes
                reference_min = $r.refMin; reference_max = $r.refMax
            } -Headers $labH | Out-Null
            Write-Host "     Result entered: $($r.value) $($r.unit) - $($r.notes)" -ForegroundColor White
            $i++
        }
    }

    Write-Host "     Verifying and completing lab order..." -ForegroundColor Yellow
    $labComp = Invoke-Api -Method Put -Url "$API/lab/orders/$($lo.id)/status" -Body @{ status = 'completed' } -Headers $labH
    if ($labComp.success) { 
        Write-Host "     Lab order COMPLETED - Results ready for doctor review" -ForegroundColor Green
        Write-Host "     (Auto-invoiced: lab charges added to patient invoice)" -ForegroundColor DarkGray
    }
} else { Write-Host "     No lab orders found for this patient" -ForegroundColor Yellow }

# --- PHARMACY (Thomas White, Pharmacist) ---
Show-Station "5." "PHARMACY" $Staff.Pharmacist.Name
$pharH = Get-Headers $Staff.Pharmacist

$rxList = Invoke-Api -Method Get -Url "$API/pharmacy/prescriptions?patient_id=$pAId" -Headers $pharH
$rxArr = @($rxList.data)
if ($rxArr.Count -gt 0) {
    $rx = $rxArr[0]
    Write-Host "     Receiving prescription: $($rx.prescription_number)" -ForegroundColor Yellow
    
    $rxDet = Invoke-Api -Method Get -Url "$API/pharmacy/prescriptions/$($rx.id)" -Headers $pharH
    if ($rxDet.data -and $rxDet.data.items) {
        foreach ($item in $rxDet.data.items) {
            $qty = if ($item.quantity) { $item.quantity } else { 10 }
            Write-Host "     Dispensing: $($item.drug_name) x$qty..." -ForegroundColor DarkGray
            Invoke-Api -Method Post -Url "$API/pharmacy/prescriptions/$($rx.id)/items/$($item.id)/dispense" -Body @{
                quantity_dispensed = $qty
                batch_number = "BATCH-$(Get-Date -Format 'yyyyMMdd')-PHA"
            } -Headers $pharH | Out-Null
            Write-Host "     Dispensed: $($item.drug_name) ($qty units)" -ForegroundColor Green
        }
    }
    Write-Host "     Counselled patient on medication usage and side effects" -ForegroundColor DarkGray
    Write-Host "     Prescription complete" -ForegroundColor Green
} else { Write-Host "     No prescriptions found" -ForegroundColor Yellow }

# --- BILLING DESK (Susan Moore, Billing Clerk) ---
Show-Station "6." "BILLING DESK" $Staff.BillingClerk.Name
$billH = Get-Headers $Staff.BillingClerk

$invA = Invoke-Api -Method Get -Url "$API/billing/invoices/encounter/$encAId" -Headers $billH
if ($invA.data) {
    $inv = $invA.data
    Write-Host "     Invoice: $($inv.invoice_number)" -ForegroundColor Yellow
    Write-Host "     Consultation fee:   KES $($inv.consultation_fee)" -ForegroundColor White
    Write-Host "     Laboratory charges: KES $($inv.lab_charges)" -ForegroundColor White
    Write-Host "     Total amount:       KES $($inv.total_amount)" -ForegroundColor White
    
    Write-Host "     Finalizing invoice..." -ForegroundColor Yellow
    Invoke-Api -Method Put -Url "$API/billing/invoices/$($inv.id)/finalize" -Headers $billH | Out-Null
    Write-Host "     Invoice issued" -ForegroundColor Green
    
    $totalPay = if ([decimal]$inv.total_amount -gt 0) { $inv.total_amount } else { 50 }
    Write-Host "     Processing M-Pesa payment of KES $totalPay..." -ForegroundColor Yellow
    $payA = Invoke-Api -Method Post -Url "$API/billing/invoices/$($inv.id)/payment" -Body @{
        payment_method = 'mpesa'; amount = $totalPay
        reference_number = "MPESA-$(Get-Date -Format 'yyyyMMddHHmmss')A"
        notes = "M-Pesa payment - patient Grace Muthoni"
    } -Headers $billH
    if ($payA.success) { Write-Host "     Payment received: KES $totalPay (M-Pesa)" -ForegroundColor Green }
}

# Reschedule follow-up
Write-Host "     Scheduling follow-up appointment for next week..." -ForegroundColor Yellow
$fuA = Invoke-Api -Method Post -Url "$API/appointments" -Body @{
    patient_id = $pAId; appointment_type = 'follow-up'
    scheduled_date = $nextWeek; scheduled_time = "09:{0:D2}" -f $rndMin
    duration_minutes = 20; doctor_id = $Staff.DoctorGM.Id; clinic_id = $clinicGM.id
    reason_for_visit = 'Follow-up: Review lab results and diabetes management'
    payment_type = 'self-pay'
} -Headers $billH
if (Get-Id $fuA) { Write-Host "     Follow-up booked: $nextWeek" -ForegroundColor Green }

Write-Host "`n     PATIENT A DISCHARGED" -ForegroundColor Green


# =====================================================================
# PATIENT B: John Odhiambo - Cardiology + Lab + Radiology
# Different doctors, different flow
# =====================================================================
Write-Host "`n================================================================" -ForegroundColor Green
Write-Host "  PATIENT B: John Odhiambo" -ForegroundColor Green
Write-Host "  Cardiology consultation with lab + radiology" -ForegroundColor Green
Write-Host "  Chief Complaint: Chest pain on exertion, SOB" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

# --- RECEPTION DESK (Alice Taylor) ---
Show-Station "1." "RECEPTION DESK" $Staff.Receptionist.Name
$recH = Get-Headers $Staff.Receptionist

Write-Host "     Registering patient..." -ForegroundColor Yellow
$pB = Invoke-Api -Method Post -Url "$API/patients" -Body @{
    first_name = 'John'; last_name = 'Odhiambo'
    date_of_birth = '1958-09-30'; gender = 'M'
    phone = '0756789012'; email = 'john.odhiambo@email.com'
    address = @{ street = '8 Oginga Odinga St'; city = 'Kisumu'; county = 'Kisumu'; country = 'Kenya' }
    blood_group = 'O+'
} -Headers $recH
$pBId = Get-Id $pB
if ($pBId) { Write-Host "     Patient registered: $pBId" -ForegroundColor Green }

Write-Host "     Booking with Dr. Chen (Cardiology)..." -ForegroundColor Yellow
$apptB = Invoke-Api -Method Post -Url "$API/appointments" -Body @{
    patient_id = $pBId; appointment_type = 'consultation'
    scheduled_date = $tomorrow; scheduled_time = "10:{0:D2}" -f $rndMin
    duration_minutes = 45; doctor_id = $Staff.DoctorCard.Id; clinic_id = $clinicCard.id
    reason_for_visit = 'Chest pain on exertion, shortness of breath for 2 months'
    payment_type = 'self-pay'
} -Headers $recH
$apptBId = Get-Id $apptB
if ($apptBId) { Write-Host "     Appointment booked: $($apptB.data.appointment_number)" -ForegroundColor Green }

# --- NURSE (Mary Johnson) ---
Show-Station "2." "NURSE TRIAGE STATION" $Staff.Nurse.Name
$nurH = Get-Headers $Staff.Nurse

if ($apptBId) {
    Invoke-Api -Method Post -Url "$API/appointments/$apptBId/confirm" -Headers $nurH | Out-Null
    $ciB = Invoke-Api -Method Post -Url "$API/appointments/$apptBId/check-in" -Headers $nurH
    if ($ciB.success) { Write-Host "     Patient checked in" -ForegroundColor Green }
}

$encB = Invoke-Api -Method Post -Url "$API/encounters" -Body @{
    patientId = $pBId; clinicId = $clinicCard.id; doctorId = $Staff.DoctorCard.Id
    encounterType = 'outpatient'
    chiefComplaint = 'Exertional chest pain and dyspnea for 2 months'
    triageLevel = 'urgent'
} -Headers $nurH
$encBId = Get-Id $encB
if ($encBId) { Write-Host "     Encounter: $($encB.data.encounter_number) - URGENT" -ForegroundColor Green }

# --- CARDIOLOGIST (Dr. Robert Chen) ---
Show-Station "3." "CARDIOLOGY CONSULTING ROOM" $Staff.DoctorCard.Name
$cardH = Get-Headers $Staff.DoctorCard

$labItemsB = @()
if ($labTests.Count -ge 2) {
    $labItemsB = @(
        @{ testId = $labTests[0].id; priority = 'urgent'; price = 500 },
        @{ testId = $labTests[3].id; priority = 'urgent'; price = 1200 }
    )
}

$radItemsB = @()
if ($radTests.Count -ge 1) {
    $radItemsB = @(
        @{ testId = $radTests[0].id; studyId = $radTests[0].id; bodyPart = 'Chest'; priority = 'urgent'; price = 2500 }
    )
}

Write-Host "     Conducting cardiac consultation..." -ForegroundColor Yellow
$consB = Invoke-Api -Method Post -Url "$API/consultations" -Body @{
    encounterId = $encBId; patientId = $pBId; doctorId = $Staff.DoctorCard.Id
    vitals = @{
        bloodPressure = '155/95'; temperature = 36.8; pulse = 92
        respiratoryRate = 22; oxygenSaturation = 95; weight = 85; height = 172; bmi = 28.7
    }
    chiefComplaint = 'Retrosternal chest tightness on exertion (climbing stairs, brisk walking) for 2 months. Associated SOB. Relieved by rest within 5 minutes.'
    historyPresentIllness = 'Progressive exertional chest pain. Initially only with heavy exertion, now with moderate activity. No rest pain. No radiation to jaw/arm. Associated with dyspnea.'
    pastMedicalHistory = 'Hypertension x 10 years (on Amlodipine 10mg). Dyslipidemia. Ex-smoker (quit 5 years ago, 20 pack-years).'
    familyHistory = 'Father: MI at age 62. Brother: CABG at 58.'
    allergies = 'NKDA'
    currentMedications = 'Amlodipine 10mg OD, Atorvastatin 20mg ON'
    examination = @{
        generalAppearance = 'Overweight male, no acute distress at rest'
        cardiovascular = 'BP 155/95. JVP not elevated. S1S2 present, S4 gallop. No murmurs. Mild bilateral ankle oedema.'
        respiratory = 'Bilateral basal fine crepitations. No wheeze.'
        abdominal = 'Obese, soft, non-tender'
        neurological = 'Intact'
        skin = 'Xanthelasma noted bilateral eyelids'
    }
    provisionalDiagnosis = 'Unstable angina - rule out ACS. Hypertensive heart disease.'
    differentialDiagnosis = 'Stable angina, NSTEMI, Aortic stenosis, GERD'
    treatmentPlan = 'Urgent cardiac workup: CBC, Lipid profile, Cardiac enzymes. Chest X-ray. Start Aspirin, increase statin. Consider ECG stress test.'
    followUpInstructions = 'Return with results in 48 hours. Go to ER immediately if chest pain at rest.'
    labOrders = $labItemsB
    radiologyOrders = $radItemsB
    prescriptions = @()
} -Headers $cardH

if ($consB.success) {
    Write-Host "     Consultation completed" -ForegroundColor Green
    Write-Host "     Diagnosis: Unstable angina r/o ACS, Hypertensive heart disease" -ForegroundColor White
    if ($consB.data.orders.labOrders.Count -gt 0) {
        Write-Host "       LAB: $($consB.data.orders.labOrders[0].orderNumber) (URGENT - cardiac markers)" -ForegroundColor Magenta
    }
    if ($consB.data.orders.radiologyOrders.Count -gt 0) {
        Write-Host "       RAD: $($consB.data.orders.radiologyOrders[0].orderNumber) (Chest imaging)" -ForegroundColor Magenta
    }
    Write-Host "     Patient directed to: Laboratory -> then Radiology" -ForegroundColor Yellow
}

# --- LAB (Jennifer Lee - different lab tech) ---
Show-Station "4." "LABORATORY (Hematology Section)" $Staff.LabTech2.Name
$lab2H = Get-Headers $Staff.LabTech2

$labOrdsB = Invoke-Api -Method Get -Url "$API/lab/orders?patient_id=$pBId" -Headers $lab2H
$labOrdBList = @($labOrdsB.data)
if ($labOrdBList.Count -gt 0) {
    $loB = $labOrdBList[0]
    Write-Host "     Receiving lab order: $($loB.order_number) (URGENT cardiac)" -ForegroundColor Yellow
    
    Invoke-Api -Method Put -Url "$API/lab/orders/$($loB.id)/status" -Body @{ status = 'sample-collected' } -Headers $lab2H | Out-Null
    Write-Host "     Blood sample collected" -ForegroundColor Green
    
    Invoke-Api -Method Put -Url "$API/lab/orders/$($loB.id)/status" -Body @{ status = 'in-progress' } -Headers $lab2H | Out-Null
    
    $labDetB = Invoke-Api -Method Get -Url "$API/lab/orders/$($loB.id)" -Headers $lab2H
    $cardResults = @(
        @{ value = '245'; unit = 'mg/dL'; notes = 'HIGH total cholesterol'; refMin = '0'; refMax = '200' },
        @{ value = '52'; unit = 'ng/L'; notes = 'ELEVATED troponin - rule out MI'; refMin = '0'; refMax = '14' }
    )
    if ($labDetB.data -and $labDetB.data.items) {
        $i = 0
        foreach ($item in $labDetB.data.items) {
            $r = if ($i -lt $cardResults.Count) { $cardResults[$i] } else { $cardResults[0] }
            Invoke-Api -Method Post -Url "$API/lab/orders/$($loB.id)/items/$($item.id)/result" -Body @{
                result_value = $r.value; result_unit = $r.unit; result_notes = $r.notes
                reference_min = $r.refMin; reference_max = $r.refMax
            } -Headers $lab2H | Out-Null
            Write-Host "     Result: $($r.value) $($r.unit) - $($r.notes)" -ForegroundColor White
            $i++
        }
    }
    
    $lcB = Invoke-Api -Method Put -Url "$API/lab/orders/$($loB.id)/status" -Body @{ status = 'completed' } -Headers $lab2H
    if ($lcB.success) { Write-Host "     Lab order COMPLETED - Critical results flagged" -ForegroundColor Green }
}

# --- RADIOLOGY (tracked - no radiologist staff seeded, use admin) ---
Show-Station "5." "RADIOLOGY DEPARTMENT" "Radiography Team"
$radOrdsB = Invoke-Api -Method Get -Url "$API/radiology/orders?patient_id=$pBId" -Headers $adminH
$radOrdBList = @($radOrdsB.data)
if ($radOrdBList.Count -gt 0) {
    Write-Host "     Radiology order: $($radOrdBList[0].order_number)" -ForegroundColor Yellow
    Write-Host "     Chest X-ray performed (PA view)" -ForegroundColor Green
    Write-Host "     Images saved to PACS. Awaiting radiologist report." -ForegroundColor DarkGray
}

# --- BILLING (Susan Moore) ---
Show-Station "6." "BILLING DESK" $Staff.BillingClerk.Name
$billH = Get-Headers $Staff.BillingClerk

$invB = Invoke-Api -Method Get -Url "$API/billing/invoices/encounter/$encBId" -Headers $billH
if ($invB.data) {
    $invD = $invB.data
    Write-Host "     Invoice: $($invD.invoice_number)" -ForegroundColor Yellow
    Write-Host "     Consultation fee:   KES $($invD.consultation_fee)" -ForegroundColor White
    Write-Host "     Laboratory charges: KES $($invD.lab_charges)" -ForegroundColor White
    Write-Host "     Total amount:       KES $($invD.total_amount)" -ForegroundColor White

    Invoke-Api -Method Put -Url "$API/billing/invoices/$($invD.id)/finalize" -Headers $billH | Out-Null
    $totalB = if ([decimal]$invD.total_amount -gt 0) { $invD.total_amount } else { 50 }
    $payB = Invoke-Api -Method Post -Url "$API/billing/invoices/$($invD.id)/payment" -Body @{
        payment_method = 'card'; amount = $totalB
        reference_number = "VISA-$(Get-Date -Format 'yyyyMMddHHmmss')B"
        notes = "Visa card payment - John Odhiambo"
    } -Headers $billH
    if ($payB.success) { Write-Host "     Payment received: KES $totalB (Visa card)" -ForegroundColor Green }
}

Write-Host "`n     PATIENT B DISCHARGED" -ForegroundColor Green


# =====================================================================
# PATIENT C: Baby Wanjiru (Pediatrics) - Quick consult + pharmacy only
# Different reception staff, pediatric nurse, pediatrician
# =====================================================================
Write-Host "`n================================================================" -ForegroundColor Green
Write-Host "  PATIENT C: Baby Wanjiru (3 years old)" -ForegroundColor Green
Write-Host "  Pediatric consultation + pharmacy only" -ForegroundColor Green
Write-Host "  Chief Complaint: Fever, cough, runny nose x 3 days" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

$PedDoc = @{
    Name = "Dr. Sarah Williams (DOC002)"
    Role = "doctor"
    Id   = "8c2fc01a-5670-4477-8e0c-f8b2f4172356"
    Token = "dev_token_doctor_8c2fc01a-5670-4477-8e0c-f8b2f4172356"
}
$PedNurse = @{
    Name = "Patricia Wilson (NUR002)"
    Role = "nurse"
    Id   = "139a6f94-3aa1-4de2-b8c2-7d2d4c06ccc0"
    Token = "dev_token_nurse_139a6f94-3aa1-4de2-b8c2-7d2d4c06ccc0"
}
$clinicPed = ($clinics | Where-Object { $_.clinic_name -like "*Children*" })[0]
if (-not $clinicPed) { $clinicPed = $clinics[0] }

# --- RECEPTION (Susan Moore this time - Alice on break) ---
Show-Station "1." "RECEPTION DESK" $Staff.BillingClerk.Name
$rec2H = Get-Headers $Staff.BillingClerk

$pC = Invoke-Api -Method Post -Url "$API/patients" -Body @{
    first_name = 'Wanjiru'; last_name = 'Kamau'
    date_of_birth = '2023-01-15'; gender = 'F'
    phone = '0767890123'
    address = @{ street = '5 Thika Road'; city = 'Thika'; country = 'Kenya' }
} -Headers $rec2H
$pCId = Get-Id $pC
if ($pCId) { Write-Host "     Patient registered: Baby Wanjiru, 3 years old" -ForegroundColor Green }

$apptC = Invoke-Api -Method Post -Url "$API/appointments" -Body @{
    patient_id = $pCId; appointment_type = 'consultation'
    scheduled_date = $tomorrow; scheduled_time = "15:{0:D2}" -f $rndMin
    duration_minutes = 20; doctor_id = $PedDoc.Id; clinic_id = $clinicPed.id
    reason_for_visit = 'Fever, cough, runny nose for 3 days'
} -Headers $rec2H
$apptCId = Get-Id $apptC
if ($apptCId) { Write-Host "     Appointment booked with Dr. Williams (Pediatrics)" -ForegroundColor Green }

# --- PEDIATRIC NURSE (Patricia Wilson) ---
Show-Station "2." "PEDIATRIC NURSE STATION" $PedNurse.Name
$pedNurH = Get-Headers $PedNurse

if ($apptCId) {
    Invoke-Api -Method Post -Url "$API/appointments/$apptCId/confirm" -Headers $pedNurH | Out-Null
    Invoke-Api -Method Post -Url "$API/appointments/$apptCId/check-in" -Headers $pedNurH | Out-Null
    Write-Host "     Baby checked in by pediatric nurse" -ForegroundColor Green
}

$encC = Invoke-Api -Method Post -Url "$API/encounters" -Body @{
    patientId = $pCId; clinicId = $clinicPed.id; doctorId = $PedDoc.Id
    encounterType = 'outpatient'
    chiefComplaint = 'Fever (38.5C), wet cough, rhinorrhea x 3 days'
    triageLevel = 'routine'
} -Headers $pedNurH
$encCId = Get-Id $encC
if ($encCId) { Write-Host "     Encounter created: $($encC.data.encounter_number)" -ForegroundColor Green }

# --- PEDIATRICIAN (Dr. Sarah Williams) ---
Show-Station "3." "PEDIATRIC CONSULTING ROOM" $PedDoc.Name
$pedDocH = Get-Headers $PedDoc

$rxItemsC = @()
if ($drugs.Count -ge 2) {
    $rxItemsC = @(
        @{ drugId = $drugs[0].id; dosage = '125mg'; frequency = 'TDS'; duration = '5'; quantity = 15
           instructions = 'Suspension - give with oral syringe after meals'; unitPrice = 30; totalPrice = 450 },
        @{ drugId = $drugs[1].id; dosage = '120mg/5ml'; frequency = 'QDS PRN'; duration = '3'; quantity = 12
           instructions = 'For fever >38C only. Max 4 doses/day'; unitPrice = 15; totalPrice = 180 }
    )
}

$consC = Invoke-Api -Method Post -Url "$API/consultations" -Body @{
    encounterId = $encCId; patientId = $pCId; doctorId = $PedDoc.Id
    vitals = @{
        bloodPressure = '90/60'; temperature = 38.5; pulse = 120
        respiratoryRate = 28; oxygenSaturation = 97; weight = 14; height = 95; bmi = 15.5
    }
    chiefComplaint = 'Fever, wet cough, rhinorrhea x 3 days. Decreased appetite.'
    historyPresentIllness = 'Mother reports high fever (measured 38.5C at home), productive cough, and clear nasal discharge for 3 days. Still drinking fluids, decreased appetite.'
    pastMedicalHistory = 'Full immunization up to date. Normal birth and milestones.'
    allergies = 'NKDA'
    examination = @{
        generalAppearance = 'Febrile toddler, irritable but consolable. Well-hydrated.'
        respiratory = 'Bilateral transmitted upper airway sounds. No wheeze, no crackles.'
        abdominal = 'Soft, non-tender'
        other = 'Ears: bilateral TMs normal. Throat: mild pharyngeal erythema, no exudate. No lymphadenopathy.'
    }
    provisionalDiagnosis = 'Acute Upper Respiratory Tract Infection (viral)'
    treatmentPlan = 'Symptomatic treatment. Amoxicillin if not improving in 48h. Antipyretics for fever. Adequate fluids.'
    followUpInstructions = 'Return if fever persists >5 days, difficulty breathing, or not drinking.'
    labOrders = @(); radiologyOrders = @()
    prescriptions = $rxItemsC
} -Headers $pedDocH

if ($consC.success) {
    Write-Host "     Consultation completed" -ForegroundColor Green
    Write-Host "     Diagnosis: Acute viral URTI" -ForegroundColor White
    Write-Host "       RX: $($consC.data.orders.prescriptions[0].prescriptionNumber) ($($rxItemsC.Count) meds)" -ForegroundColor Magenta
}

# --- PHARMACY (Thomas White) ---
Show-Station "4." "PHARMACY" $Staff.Pharmacist.Name
$pharH = Get-Headers $Staff.Pharmacist

$rxC = Invoke-Api -Method Get -Url "$API/pharmacy/prescriptions?patient_id=$pCId" -Headers $pharH
$rxCArr = @($rxC.data)
if ($rxCArr.Count -gt 0) {
    $rxDC = Invoke-Api -Method Get -Url "$API/pharmacy/prescriptions/$($rxCArr[0].id)" -Headers $pharH
    if ($rxDC.data -and $rxDC.data.items) {
        foreach ($item in $rxDC.data.items) {
            $qty = if ($item.quantity) { $item.quantity } else { 10 }
            Invoke-Api -Method Post -Url "$API/pharmacy/prescriptions/$($rxCArr[0].id)/items/$($item.id)/dispense" -Body @{
                quantity_dispensed = $qty; batch_number = "BATCH-$(Get-Date -Format 'yyyyMMdd')-PED"
            } -Headers $pharH | Out-Null
            Write-Host "     Dispensed: $($item.drug_name) x$qty (pediatric dose)" -ForegroundColor Green
        }
    }
    Write-Host "     Counselled mother on dosing and fever management" -ForegroundColor DarkGray
}

# --- BILLING (Alice Taylor back from break) ---
Show-Station "5." "BILLING DESK" $Staff.Receptionist.Name
$recH = Get-Headers $Staff.Receptionist

$invC = Invoke-Api -Method Get -Url "$API/billing/invoices/encounter/$encCId" -Headers $recH
if ($invC.data) {
    $invDC = $invC.data
    Write-Host "     Invoice: $($invDC.invoice_number) | Total: KES $($invDC.total_amount)" -ForegroundColor White
    Invoke-Api -Method Put -Url "$API/billing/invoices/$($invDC.id)/finalize" -Headers $recH | Out-Null
    $totalC = if ([decimal]$invDC.total_amount -gt 0) { $invDC.total_amount } else { 50 }
    $payC = Invoke-Api -Method Post -Url "$API/billing/invoices/$($invDC.id)/payment" -Body @{
        payment_method = 'cash'; amount = $totalC; notes = "Cash payment - Baby Wanjiru's mother"
    } -Headers $recH
    if ($payC.success) { Write-Host "     Payment received: KES $totalC (cash)" -ForegroundColor Green }
}
Write-Host "`n     PATIENT C DISCHARGED" -ForegroundColor Green


# =====================================================================
# FINAL SUMMARY
# =====================================================================
Write-Host "`n================================================================" -ForegroundColor White
Write-Host "  SIMULATION COMPLETE - Staff Activity Summary" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White

$staffActions = @(
    @{ Staff = "Alice Taylor (Receptionist)"; Actions = "2 registrations, 2 bookings, 1 confirm, 1 billing" },
    @{ Staff = "Susan Moore (Receptionist/Billing)"; Actions = "1 registration, 1 booking, 2 billing, 2 payments" },
    @{ Staff = "Mary Johnson (Nurse)"; Actions = "2 check-ins, 2 encounter creations (triage)" },
    @{ Staff = "Patricia Wilson (Ped Nurse)"; Actions = "1 check-in, 1 encounter creation" },
    @{ Staff = "Dr. James Anderson (Gen Med)"; Actions = "1 full consultation (DM), 3 lab + 2 rx orders" },
    @{ Staff = "Dr. Robert Chen (Cardiology)"; Actions = "1 cardiac consultation, 2 lab + 1 rad orders" },
    @{ Staff = "Dr. Sarah Williams (Pediatrics)"; Actions = "1 pediatric consultation, 2 rx orders" },
    @{ Staff = "David Garcia (Lab Tech)"; Actions = "1 lab order processed, 3 results entered" },
    @{ Staff = "Jennifer Lee (Lab Tech)"; Actions = "1 cardiac lab order, 2 results entered" },
    @{ Staff = "Thomas White (Pharmacist)"; Actions = "2 prescriptions dispensed (4 medications total)" }
)

foreach ($s in $staffActions) {
    Write-Host "  $($s.Staff)" -ForegroundColor Cyan -NoNewline
    Write-Host ": $($s.Actions)" -ForegroundColor Gray
}

Write-Host ""
$stats = Invoke-Api -Method Get -Url "$API/billing/statistics" -Headers $adminH
Write-Host "  Financial Summary:" -ForegroundColor White
if ($stats.data) {
    Write-Host "    Today's payments: KES $($stats.data.payments_today)" -ForegroundColor Green
    Write-Host "    Outstanding:      KES $($stats.data.total_outstanding)" -ForegroundColor Yellow
}

Write-Host "`n================================================================" -ForegroundColor White
Write-Host "  10 different staff members across 6 hospital stations" -ForegroundColor White
Write-Host "  3 patients through 3 different clinical pathways" -ForegroundColor White
Write-Host "  Patient A: Gen Med  (Lab + Pharmacy)" -ForegroundColor White
Write-Host "  Patient B: Cardiology (Lab + Radiology)" -ForegroundColor White  
Write-Host "  Patient C: Pediatrics (Pharmacy only)" -ForegroundColor White
Write-Host "================================================================`n" -ForegroundColor White
