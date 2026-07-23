##############################################################################
#  MediMesh - Multi-Hospital Patient Workflow Simulations
#  ======================================================
#  6 diverse patient scenarios flowing through every hospital station:
#    Reception > Triage > Consultation > Lab > Radiology > Pharmacy > Billing
#
#  Each simulation uses DIFFERENT clinics, doctors, nurses, and order combos.
##############################################################################

# Exercise the same-origin gateway used by the React application. The API is
# intentionally not published directly on a host port.
$BASE = "http://localhost:3000/api"
$ErrorActionPreference = "Continue"

# -- colour helpers -----------------------------------------------------------
function Write-Station  { param($msg) Write-Host "`n  [$msg]" -ForegroundColor Cyan }
function Write-OK       { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Fail     { param($msg) Write-Host "    [FAIL] $msg" -ForegroundColor Red; $script:errors++ }
function Write-Info     { param($msg) Write-Host "    -> $msg" -ForegroundColor DarkGray }
function Write-SimTitle { param($n,$title,$desc)
    Write-Host "`n================================================================" -ForegroundColor Yellow
    Write-Host "  SIMULATION $n : $title" -ForegroundColor Yellow
    Write-Host "  $desc" -ForegroundColor DarkYellow
    Write-Host "================================================================" -ForegroundColor Yellow
}

# -- staff roster (real DB IDs) -----------------------------------------------
$Staff = @{
    ReceptionistAlice = "6d597381-5453-44f5-b04b-c78fe3b4ae94"
    ReceptionistSusan = "ef409a8e-7254-4b5b-9d5c-71ea318067a3"
    NurseMary         = "248031b7-5c75-4ace-af51-bc351ee48a65"
    NursePatricia     = "139a6f94-3aa1-4de2-b8c2-7d2d4c06ccc0"
    NurseLinda        = "f5edf469-7195-45e5-b1ec-70ce2a95be75"
    DrAnderson        = "21a897fd-0c43-41c1-8448-f70df0ee6a65"
    DrWilliams        = "8c2fc01a-5670-4477-8e0c-f8b2f4172356"
    DrChen            = "dfa66eb9-10c8-4339-9658-34fa7df572f6"
    DrBrown           = "9d060a5a-36ad-4347-b8c5-0c86bbcc4014"
    DrDavis           = "70644c5f-2436-45fa-b6af-6997188e092f"
    LabDavid          = "acd67ee6-7494-4350-95de-d1dedc0fbaaa"
    LabJennifer       = "7b608ab1-3b64-41d0-b27a-33e355345f48"
    PharmThomas       = "b8187c90-594f-4e8c-a008-f5386a6c8894"
}

# -- clinic IDs ---------------------------------------------------------------
$Clinic = @{
    Anderson    = "d1e3495d-020e-4f1f-806b-1576a4ba2bb9"
    Cardiology  = "d6684fce-bc33-444e-a96e-f5fed9a7acbb"
    Pediatric   = "eb934024-4777-4a33-af44-34531c775488"
    GeneralOPD  = "a40fc015-93dc-49b4-b1cb-2a3bd4b99924"
    Maternity   = "4d23c435-b5af-489e-875e-909e406bd776"
    Surgical    = "822063c4-69ed-4c3f-983a-78af0a07e59c"
}

# -- helper: sign in through the same endpoint used by the frontend -----------
$DemoCredentials = @{
    admin        = @{ username = "admin";        password = "admin123" }
    doctor       = @{ username = "doctor";       password = "doctor123" }
    nurse        = @{ username = "nurse";        password = "nurse123" }
    receptionist = @{ username = "receptionist"; password = "reception123" }
    labtech      = @{ username = "labtech";      password = "lab123" }
    pharmacist   = @{ username = "pharmacist";   password = "pharmacy123" }
    radiologist  = @{ username = "radiologist";  password = "radiology123" }
    billing      = @{ username = "billing";      password = "billing123" }
}
$RoleTokens = @{}

function Get-Headers {
    param($role, $staffId)

    if (-not $RoleTokens.ContainsKey($role)) {
        $credential = $DemoCredentials[$role]
        if (-not $credential) {
            throw "No demo login is configured for role '$role'"
        }

        $loginBody = $credential | ConvertTo-Json
        $login = Invoke-RestMethod -Method POST -Uri "$BASE/auth/login" -ContentType "application/json" -Body $loginBody
        $token = $login.access_token
        if (-not $token) { $token = $login.accessToken }
        if (-not $token) { $token = $login.token }
        if (-not $token) { throw "Login for role '$role' did not return an access token" }
        $RoleTokens[$role] = $token
    }

    @{
        "Authorization" = "Bearer " + $RoleTokens[$role]
        "Content-Type"  = "application/json"
    }
}

# -- helper: safe REST call ---------------------------------------------------
function Invoke-Api {
    param($Method, $Uri, $Headers, $Body)
    try {
        $params = @{ Method = $Method; Uri = $Uri; Headers = $Headers; ContentType = "application/json" }
        if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10) }
        $resp = Invoke-RestMethod @params
        return $resp
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $detail = $_.ErrorDetails.Message
        Write-Fail "HTTP $status on $Method $Uri"
        if ($detail) { Write-Info $detail }
        return $null
    }
}

# -- counters -----------------------------------------------------------------
$script:errors      = 0
$script:totalSteps  = 0
$script:passedSteps = 0
$script:totalRevenue = 0

function Step-Pass { param($msg) $script:totalSteps++; $script:passedSteps++; Write-OK $msg }
function Step-Fail { param($msg) $script:totalSteps++; Write-Fail $msg }

##############################################################################
# REUSABLE STATION FUNCTIONS
##############################################################################

# -- STATION 1: Reception - Register Patient ----------------------------------
function Register-Patient {
    param($receptionistId, $patientData)
    Write-Station "RECEPTION - Registering patient"
    $h = Get-Headers "receptionist" $receptionistId
    $resp = Invoke-Api -Method "POST" -Uri "$BASE/patients" -Headers $h -Body $patientData
    if ($resp -and $resp.data) {
        $p = $resp.data
        $patientNumber = if ($p.uhid) { $p.uhid } else { $p.medical_record_number }
        Step-Pass "Registered: $($p.first_name) $($p.last_name) (UHID: $patientNumber)"
        return $p
    }
    Step-Fail "Patient registration failed"
    return $null
}

# -- STATION 2: Reception - Create Encounter ----------------------------------
function Create-Encounter {
    param($receptionistId, $patientId, $clinicId, $doctorId, $encounterType, $triageLevel, $chiefComplaint, $paymentType)
    Write-Station "RECEPTION - Creating encounter"
    $h = Get-Headers "receptionist" $receptionistId
    if (-not $encounterType) { $encounterType = "outpatient" }
    if (-not $triageLevel)   { $triageLevel = "routine" }
    if (-not $paymentType)   { $paymentType = "self-pay" }
    $body = @{
        patient_id      = $patientId
        encounter_type  = $encounterType
        triage_level    = $triageLevel
        clinic_id       = $clinicId
        doctor_id       = $doctorId
        chief_complaint = $chiefComplaint
        payment_type    = $paymentType
    }
    $resp = Invoke-Api -Method "POST" -Uri "$BASE/encounters" -Headers $h -Body $body
    if ($resp -and $resp.data) {
        $e = $resp.data
        Step-Pass "Encounter $($e.encounter_number) - type=$encounterType, triage=$triageLevel"
        return $e
    }
    Step-Fail "Encounter creation failed"
    return $null
}

# -- STATION 3: Nurse - Triage / update queue ---------------------------------
function Triage-Patient {
    param($nurseId, $encounterId, $patientId, $triageLevel)
    Write-Station "TRIAGE - Nurse updating triage"
    $h = Get-Headers "nurse" $nurseId
    $body = @{ status = "triage"; triage_level = $triageLevel }
    $resp = Invoke-Api -Method "PUT" -Uri "$BASE/encounters/$encounterId" -Headers $h -Body $body
    if ($resp -and $resp.success) {
        Step-Pass "Triage complete - level: $triageLevel"
        return $true
    }
    Step-Fail "Triage update failed"
    return $false
}

# -- STATION 4: Doctor - Consultation with orders -----------------------------
function Run-Consultation {
    param(
        $doctorId, $encounterId, $patientId,
        $chiefComplaint, $diagnosis, $treatmentPlan,
        $vitals, $examination,
        $labOrders, $radiologyOrders, $prescriptions
    )
    Write-Station "CONSULTATION - Doctor examining patient"
    $h = Get-Headers "doctor" $doctorId

    if (-not $labOrders)       { $labOrders = @() }
    if (-not $radiologyOrders) { $radiologyOrders = @() }
    if (-not $prescriptions)   { $prescriptions = @() }

    $body = @{
        encounterId           = $encounterId
        patientId             = $patientId
        doctorId              = $doctorId
        vitals                = $vitals
        chiefComplaint        = $chiefComplaint
        historyPresentIllness = "Patient presents with $chiefComplaint"
        examination           = $examination
        provisionalDiagnosis  = $diagnosis
        treatmentPlan         = $treatmentPlan
        followUpInstructions  = "Return in 2 weeks if symptoms persist"
        labOrders             = $labOrders
        radiologyOrders       = $radiologyOrders
        prescriptions         = $prescriptions
    }
    $resp = Invoke-Api -Method "POST" -Uri "$BASE/consultations" -Headers $h -Body $body
    if ($resp -and $resp.data) {
        $c = $resp.data
        Step-Pass "Consultation recorded - Dx: $diagnosis"
        if ($c.orders) {
            if ($c.orders.labOrders -and $c.orders.labOrders.Count -gt 0) { Write-Info "Lab orders: $($c.orders.labOrders.Count)" }
            if ($c.orders.radiologyOrders -and $c.orders.radiologyOrders.Count -gt 0) { Write-Info "Radiology orders: $($c.orders.radiologyOrders.Count)" }
            if ($c.orders.prescriptions -and $c.orders.prescriptions.Count -gt 0) { Write-Info "Prescriptions: $($c.orders.prescriptions.Count)" }
        }
        return $c
    }
    Step-Fail "Consultation failed"
    return $null
}

# -- STATION 5: Lab - Process orders -----------------------------------------
function Process-Lab {
    param($labTechId, $patientId)
    Write-Station "LABORATORY - Processing lab orders"
    $h = Get-Headers "labtech" $labTechId

    $labUrl = "$BASE/lab/orders?patient_id=$patientId" + [char]38 + "status=pending"
    $resp = Invoke-Api -Method "GET" -Uri $labUrl -Headers $h
    if (-not $resp -or -not $resp.data -or $resp.data.Count -eq 0) {
        Write-Info "No pending lab orders found"
        return
    }

    foreach ($order in $resp.data) {
        $orderId = $order.id
        Write-Info "Processing order $($order.order_number)..."

        # Get order details with items first (need item IDs for collect)
        $orderDetail = Invoke-Api -Method "GET" -Uri "$BASE/lab/orders/$orderId" -Headers $h
        if (-not $orderDetail -or -not $orderDetail.data -or -not $orderDetail.data.items) {
            Step-Fail "Could not get order details for $($order.order_number)"
            continue
        }

        # Collect sample - endpoint requires item_ids array
        $itemIds = @($orderDetail.data.items | ForEach-Object { $_.id })
        $collectBody = @{
            item_ids        = $itemIds
            collection_site = "phlebotomy_room"
        }
        $collectResp = Invoke-Api -Method "POST" -Uri "$BASE/lab/orders/$orderId/collect" -Headers $h -Body $collectBody
        if ($collectResp -and $collectResp.success) {
            Step-Pass "Sample collected for order $($order.order_number) ($($itemIds.Count) items)"
        } else {
            Step-Fail "Sample collection failed for order $($order.order_number)"
        }

        # Enter results for each item
        foreach ($item in $orderDetail.data.items) {
            $resultBody = @{
                result_value  = "Normal"
                result_status = "final"
                performed_by  = $labTechId
                notes         = "Within normal reference range"
            }
            $resultResp = Invoke-Api -Method "POST" -Uri "$BASE/lab/orders/$orderId/items/$($item.id)/result" -Headers $h -Body $resultBody
            if ($resultResp -and $resultResp.success) {
                Step-Pass "Result entered: $($item.test_name) -> Normal"
            } else {
                Step-Fail "Result entry failed for $($item.test_name)"
            }
        }
    }
}

# -- STATION 6: Radiology - process and complete orders ------------------------
function Process-Radiology {
    param($patientId)
    Write-Station "RADIOLOGY - Processing radiology orders"
    $h = Get-Headers "radiologist" $null

    $radUrl = "$BASE/radiology/orders?patient_id=$patientId"
    $resp = Invoke-Api -Method "GET" -Uri $radUrl -Headers $h
    if ($resp -and $resp.data -and $resp.data.Count -gt 0) {
        foreach ($order in $resp.data) {
            Step-Pass "Radiology order found: $($order.order_number) - status: $($order.status)"

            # Complete the radiology order (triggers billing charge)
            $completeResp = Invoke-Api -Method "PUT" -Uri "$BASE/radiology/orders/$($order.id)/status" -Headers $h -Body @{
                status       = "completed"
                report_notes = "Study completed, findings normal"
            }
            if ($completeResp -and $completeResp.success) {
                Step-Pass "Radiology order $($order.order_number) completed (billed)"
            } else {
                Step-Fail "Failed to complete radiology order $($order.order_number)"
            }
        }
    } else {
        Write-Info "No radiology orders for this patient"
    }
}

# -- STATION 7: Pharmacy - Dispense prescriptions -----------------------------
function Process-Pharmacy {
    param($pharmacistId, $patientId)
    Write-Station "PHARMACY - Dispensing medications"
    $h = Get-Headers "pharmacist" $pharmacistId

    $rxUrl = "$BASE/pharmacy/prescriptions?patient_id=$patientId" + [char]38 + "status=pending"
    $resp = Invoke-Api -Method "GET" -Uri $rxUrl -Headers $h
    if (-not $resp -or -not $resp.data -or $resp.data.Count -eq 0) {
        Write-Info "No pending prescriptions"
        return
    }

    foreach ($rx in $resp.data) {
        $rxId = $rx.id
        Write-Info "Processing Rx $($rx.prescription_number)..."

        $rxDetail = Invoke-Api -Method "GET" -Uri "$BASE/pharmacy/prescriptions/$rxId" -Headers $h
        if ($rxDetail -and $rxDetail.data -and $rxDetail.data.items) {
            foreach ($item in $rxDetail.data.items) {
                $dispBody = @{
                    dispensed_quantity = $item.quantity
                    dispensed_by      = $pharmacistId
                    notes             = "Dispensed as prescribed"
                }
                $dispResp = Invoke-Api -Method "POST" -Uri "$BASE/pharmacy/prescriptions/$rxId/items/$($item.id)/dispense" -Headers $h -Body $dispBody
                if ($dispResp -and $dispResp.success) {
                    if ($item.drug_name) { $dName = $item.drug_name } else { $dName = $item.generic_name }
                    Step-Pass "Dispensed: $dName x$($item.quantity)"
                } else {
                    Step-Fail "Dispensing failed for item $($item.id)"
                }
            }
        }
    }
}

# -- STATION 8: Billing - Finalize invoice and collect payment ----------------
function Process-Billing {
    param($encounterId, $paymentMethod)
    if (-not $paymentMethod) { $paymentMethod = "cash" }
    Write-Station "BILLING - Invoice and payment"
    $h = Get-Headers "billing" $null

    $resp = Invoke-Api -Method "GET" -Uri "$BASE/billing/invoices/encounter/$encounterId" -Headers $h
    if (-not $resp -or -not $resp.data) {
        Write-Info "No auto-generated invoice found - creating one"
        $resp = Invoke-Api -Method "POST" -Uri "$BASE/billing/invoices" -Headers $h -Body @{
            encounter_id = $encounterId
        }
        if ($resp -and $resp.data) {
            Step-Pass "Invoice created manually"
        } else {
            Step-Fail "Could not create invoice"
            return 0
        }
    }

    $invoice = $resp.data
    $invId   = $invoice.id

    if ($invoice.total_amount) { $rawTotal = $invoice.total_amount }
    elseif ($invoice.total)    { $rawTotal = $invoice.total }
    else                       { $rawTotal = 0 }
    $total = [decimal]$rawTotal

    if ($null -ne $invoice.balance_due) { $rawBal = $invoice.balance_due }
    else                                { $rawBal = $total }
    $balance = [decimal]$rawBal

    Step-Pass "Invoice $($invoice.invoice_number) - Total: KES $total, Balance: KES $balance"

    if ($balance -gt 0) {
        $payBody = @{
            amount         = $balance
            payment_method = $paymentMethod
            reference      = "SIM-PAY-$(Get-Random -Maximum 99999)"
        }
        $payResp = Invoke-Api -Method "POST" -Uri "$BASE/billing/invoices/$invId/payment" -Headers $h -Body $payBody
        if ($payResp -and $payResp.success) {
            Step-Pass "Payment received: KES $balance via $paymentMethod"
            $script:totalRevenue += $balance
        } else {
            Step-Fail "Payment processing failed"
        }
    } else {
        Write-Info "No balance due"
    }
    return $total
}

##############################################################################
# SIMULATION 1 - Emergency Malaria Case (General OPD)
##############################################################################
function Run-Simulation1 {
    Write-SimTitle "1" "EMERGENCY MALARIA" "Fever patient > General OPD > Lab (Malaria+CBC) > Pharmacy > Billing"

    $patient = Register-Patient $Staff.ReceptionistAlice @{
        first_name    = "John"
        last_name     = "Ochieng"
        date_of_birth = "1988-03-15"
        gender        = "M"
        phone         = "+254712345001"
        email         = "j.ochieng@test.com"
        blood_type    = "O+"
        id_type       = "national_id"
        id_number     = "SIM1-$(Get-Random -Maximum 99999)"
        address       = @{ street = "Oginga Odinga Rd"; city = "Kisumu"; state = "Kisumu County"; country = "Kenya" }
    }
    if (-not $patient) { return }

    $enc = Create-Encounter $Staff.ReceptionistAlice $patient.id $Clinic.GeneralOPD $Staff.DrAnderson "outpatient" "urgent" "High fever for 3 days, chills, headache" "self-pay"
    if (-not $enc) { return }

    Triage-Patient $Staff.NurseMary $enc.id $patient.id "urgent"

    $consultation = Run-Consultation `
        -doctorId $Staff.DrAnderson `
        -encounterId $enc.id `
        -patientId $patient.id `
        -chiefComplaint "High fever, chills, body aches for 3 days" `
        -diagnosis "Suspected Malaria" `
        -treatmentPlan "Antimalarial therapy + supportive care" `
        -vitals @{ bloodPressure="110/70"; temperature="39.2"; pulse="98"; respiratoryRate="20"; oxygenSaturation="97"; weight="72"; height="175" } `
        -examination @{ generalAppearance="Febrile, diaphoretic"; abdominal="Mild splenomegaly" } `
        -labOrders @(
            @{ testId = 7; priority = "urgent"; clinicalNotes = "Rule out Malaria" },
            @{ testId = 1; priority = "urgent"; clinicalNotes = "Baseline CBC" }
        ) `
        -radiologyOrders @() `
        -prescriptions @(
            @{ drugId = 2; dosage = "1g"; frequency = "every 6 hours"; duration = "3 days"; quantity = 12 },
            @{ drugId = 1; dosage = "500mg"; frequency = "every 8 hours"; duration = "7 days"; quantity = 21 }
        )

    Process-Lab $Staff.LabDavid $patient.id
    Process-Pharmacy $Staff.PharmThomas $patient.id
    Process-Billing $enc.id "cash"
}

##############################################################################
# SIMULATION 2 - Cardiac Chest Pain (Cardiology Clinic)
##############################################################################
function Run-Simulation2 {
    Write-SimTitle "2" "CARDIAC CHEST PAIN" "Chest pain > Cardiology > Lab (Lipid) + Radiology (Chest XR) > Pharmacy > Billing"

    $patient = Register-Patient $Staff.ReceptionistSusan @{
        first_name    = "Grace"
        last_name     = "Wanjiku"
        date_of_birth = "1965-07-22"
        gender        = "F"
        phone         = "+254712345002"
        email         = "g.wanjiku@test.com"
        blood_type    = "A+"
        id_type       = "national_id"
        id_number     = "SIM2-$(Get-Random -Maximum 99999)"
        address       = @{ street = "Kenyatta Ave"; city = "Nairobi"; state = "Nairobi County"; country = "Kenya" }
    }
    if (-not $patient) { return }

    $enc = Create-Encounter $Staff.ReceptionistSusan $patient.id $Clinic.Cardiology $Staff.DrChen "outpatient" "emergency" "Chest pain radiating to left arm" "insurance"
    if (-not $enc) { return }

    Triage-Patient $Staff.NurseMary $enc.id $patient.id "emergency"

    $consultation = Run-Consultation `
        -doctorId $Staff.DrChen `
        -encounterId $enc.id `
        -patientId $patient.id `
        -chiefComplaint "Chest pain radiating to left arm, shortness of breath" `
        -diagnosis "Unstable Angina - rule out MI" `
        -treatmentPlan "Cardioprotective medications, monitor, follow-up echo" `
        -vitals @{ bloodPressure="160/95"; temperature="36.8"; pulse="105"; respiratoryRate="22"; oxygenSaturation="94"; weight="78"; height="162" } `
        -examination @{ generalAppearance="Anxious, diaphoretic"; cardiovascular="S4 gallop, no murmur"; respiratory="Bibasilar crackles" } `
        -labOrders @(
            @{ testId = 8; priority = "urgent"; clinicalNotes = "Lipid profile for cardiac risk" }
        ) `
        -radiologyOrders @(
            @{ testId = 1; priority = "urgent"; clinicalIndication = "Rule out cardiomegaly/pulmonary edema" }
        ) `
        -prescriptions @(
            @{ drugId = 5; dosage = "5mg"; frequency = "once daily"; duration = "30 days"; quantity = 30 },
            @{ drugId = 2; dosage = "500mg"; frequency = "every 6 hours PRN"; duration = "5 days"; quantity = 20 }
        )

    Process-Lab $Staff.LabJennifer $patient.id
    Process-Radiology $patient.id
    Process-Pharmacy $Staff.PharmThomas $patient.id
    Process-Billing $enc.id "insurance"
}

##############################################################################
# SIMULATION 3 - Pediatric Fever and Cough (Children's Clinic)
##############################################################################
function Run-Simulation3 {
    Write-SimTitle "3" "PEDIATRIC PNEUMONIA" "Child > Children Clinic > Lab (CBC+Malaria) + Radiology (Chest XR) > Pharmacy > Billing"

    $patient = Register-Patient $Staff.ReceptionistAlice @{
        first_name    = "Amani"
        last_name     = "Kimani"
        date_of_birth = "2020-11-08"
        gender        = "M"
        phone         = "+254712345003"
        email         = "parent.kimani@test.com"
        blood_type    = "B+"
        id_type       = "birth_certificate"
        id_number     = "SIM3-$(Get-Random -Maximum 99999)"
        address       = @{ street = "Moi Rd"; city = "Nakuru"; state = "Nakuru County"; country = "Kenya" }
    }
    if (-not $patient) { return }

    $enc = Create-Encounter $Staff.ReceptionistAlice $patient.id $Clinic.Pediatric $Staff.DrWilliams "outpatient" "urgent" "Persistent cough, fever 4 days, poor appetite" "self-pay"
    if (-not $enc) { return }

    Triage-Patient $Staff.NursePatricia $enc.id $patient.id "urgent"

    $consultation = Run-Consultation `
        -doctorId $Staff.DrWilliams `
        -encounterId $enc.id `
        -patientId $patient.id `
        -chiefComplaint "Persistent productive cough, high fever 4 days, poor appetite" `
        -diagnosis "Pneumonia - community acquired" `
        -treatmentPlan "Antibiotics, antipyretics, chest physiotherapy, hydration" `
        -vitals @{ bloodPressure="90/60"; temperature="38.8"; pulse="130"; respiratoryRate="36"; oxygenSaturation="95"; weight="14"; height="90" } `
        -examination @{ generalAppearance="Irritable, febrile child"; respiratory="Bilateral crackles, reduced air entry right base"; abdominal="Soft, non-tender" } `
        -labOrders @(
            @{ testId = 1; priority = "urgent"; clinicalNotes = "CBC for sepsis screen" },
            @{ testId = 7; priority = "urgent"; clinicalNotes = "Malaria endemic area" }
        ) `
        -radiologyOrders @(
            @{ testId = 1; priority = "urgent"; clinicalIndication = "Rule out pneumonia consolidation" }
        ) `
        -prescriptions @(
            @{ drugId = 1; dosage = "250mg"; frequency = "every 8 hours"; duration = "7 days"; quantity = 21 },
            @{ drugId = 2; dosage = "250mg"; frequency = "every 6 hours"; duration = "3 days"; quantity = 12 }
        )

    Process-Lab $Staff.LabDavid $patient.id
    Process-Radiology $patient.id
    Process-Pharmacy $Staff.PharmThomas $patient.id
    Process-Billing $enc.id "cash"
}

##############################################################################
# SIMULATION 4 - Diabetic Follow-up (Anderson Clinic / General Medicine)
##############################################################################
function Run-Simulation4 {
    Write-SimTitle "4" "DIABETIC FOLLOW-UP" "Routine DM > Anderson Clinic > Lab (FBS+HbA1c+RFT+Urinalysis) > Pharmacy > Billing"

    $patient = Register-Patient $Staff.ReceptionistSusan @{
        first_name    = "Peter"
        last_name     = "Mwangi"
        date_of_birth = "1955-01-10"
        gender        = "M"
        phone         = "+254712345004"
        email         = "p.mwangi@test.com"
        blood_type    = "AB+"
        id_type       = "national_id"
        id_number     = "SIM4-$(Get-Random -Maximum 99999)"
        address       = @{ street = "Uganda Rd"; city = "Eldoret"; state = "Uasin Gishu County"; country = "Kenya" }
    }
    if (-not $patient) { return }

    $enc = Create-Encounter $Staff.ReceptionistSusan $patient.id $Clinic.Anderson $Staff.DrAnderson "outpatient" "routine" "Diabetic follow-up, polyuria, fatigue" "self-pay"
    if (-not $enc) { return }

    Triage-Patient $Staff.NurseMary $enc.id $patient.id "routine"

    $consultation = Run-Consultation `
        -doctorId $Staff.DrAnderson `
        -encounterId $enc.id `
        -patientId $patient.id `
        -chiefComplaint "3-month diabetic follow-up, increased thirst and polyuria" `
        -diagnosis "Type 2 Diabetes Mellitus - poorly controlled" `
        -treatmentPlan "Increase Metformin dose, dietary counseling, renal monitoring" `
        -vitals @{ bloodPressure="140/85"; temperature="36.5"; pulse="78"; respiratoryRate="18"; oxygenSaturation="98"; weight="92"; height="170"; bmi="31.8" } `
        -examination @{ generalAppearance="Obese, well-oriented"; cardiovascular="Normal S1S2, no murmurs" } `
        -labOrders @(
            @{ testId = 2; priority = "routine"; clinicalNotes = "Fasting glucose check" },
            @{ testId = 3; priority = "routine"; clinicalNotes = "Glycemic control assessment" },
            @{ testId = 5; priority = "routine"; clinicalNotes = "Renal function monitoring" },
            @{ testId = 6; priority = "routine"; clinicalNotes = "Urine protein screening" }
        ) `
        -radiologyOrders @() `
        -prescriptions @(
            @{ drugId = 4; dosage = "1000mg"; frequency = "twice daily"; duration = "90 days"; quantity = 180 },
            @{ drugId = 5; dosage = "5mg"; frequency = "once daily"; duration = "90 days"; quantity = 90 }
        )

    Process-Lab $Staff.LabDavid $patient.id
    Process-Pharmacy $Staff.PharmThomas $patient.id
    # Use cash in the destructive workflow simulation. M-Pesa STK is covered by
    # mocked frontend/API contract tests so this script never sends a phone prompt.
    Process-Billing $enc.id "cash"
}

##############################################################################
# SIMULATION 5 - Surgical Consult: Abdominal Pain (Surgical Outpatient)
##############################################################################
function Run-Simulation5 {
    Write-SimTitle "5" "SURGICAL ABDOMINAL PAIN" "Acute abdomen > Surgical Clinic > Lab (CBC+LFT+RFT) + Radiology (XR+US) > Pharmacy > Billing"

    $patient = Register-Patient $Staff.ReceptionistAlice @{
        first_name    = "Fatma"
        last_name     = "Hassan"
        date_of_birth = "1992-05-30"
        gender        = "F"
        phone         = "+254712345005"
        email         = "f.hassan@test.com"
        blood_type    = "O-"
        id_type       = "national_id"
        id_number     = "SIM5-$(Get-Random -Maximum 99999)"
        address       = @{ street = "Digo Rd"; city = "Mombasa"; state = "Mombasa County"; country = "Kenya" }
    }
    if (-not $patient) { return }

    $enc = Create-Encounter $Staff.ReceptionistAlice $patient.id $Clinic.Surgical $Staff.DrBrown "emergency" "urgent" "Severe RUQ abdominal pain, nausea, vomiting" "self-pay"
    if (-not $enc) { return }

    Triage-Patient $Staff.NurseLinda $enc.id $patient.id "urgent"

    $consultation = Run-Consultation `
        -doctorId $Staff.DrBrown `
        -encounterId $enc.id `
        -patientId $patient.id `
        -chiefComplaint "Severe right upper quadrant abdominal pain for 12 hours, nausea, vomiting" `
        -diagnosis "Acute Cholecystitis - rule out choledocholithiasis" `
        -treatmentPlan "IV antibiotics, NPO, pain management, surgical evaluation for cholecystectomy" `
        -vitals @{ bloodPressure="130/80"; temperature="38.2"; pulse="92"; respiratoryRate="20"; oxygenSaturation="97"; weight="65"; height="160" } `
        -examination @{
            generalAppearance = "In moderate distress, guarding RUQ"
            abdominal         = "Positive Murphy sign, RUQ tenderness, mild distension"
            cardiovascular    = "Tachycardic, regular rhythm"
        } `
        -labOrders @(
            @{ testId = 1; priority = "urgent"; clinicalNotes = "CBC - leukocytosis screen" },
            @{ testId = 4; priority = "urgent"; clinicalNotes = "LFT - biliary obstruction" },
            @{ testId = 5; priority = "urgent"; clinicalNotes = "Pre-op renal baseline" }
        ) `
        -radiologyOrders @(
            @{ testId = 2; priority = "urgent"; clinicalIndication = "Rule out bowel obstruction or perforation" },
            @{ testId = 5; priority = "urgent"; clinicalIndication = "Rule out gallstones, cholecystitis" }
        ) `
        -prescriptions @(
            @{ drugId = 6; dosage = "40mg"; frequency = "once daily"; duration = "14 days"; quantity = 14 },
            @{ drugId = 3; dosage = "400mg"; frequency = "every 8 hours PRN"; duration = "5 days"; quantity = 15 }
        )

    Process-Lab $Staff.LabJennifer $patient.id
    Process-Radiology $patient.id
    Process-Pharmacy $Staff.PharmThomas $patient.id
    Process-Billing $enc.id "cash"
}

##############################################################################
# SIMULATION 6 - Maternity / Prenatal Visit (Maternity Clinic)
##############################################################################
function Run-Simulation6 {
    Write-SimTitle "6" "PRENATAL VISIT" "Pregnant mother > Maternity Clinic > Lab (CBC+Urinalysis) + Radiology (OB US) > Pharmacy > Billing"

    $patient = Register-Patient $Staff.ReceptionistSusan @{
        first_name    = "Wanjiru"
        last_name     = "Njeri"
        date_of_birth = "1996-09-14"
        gender        = "F"
        phone         = "+254712345006"
        email         = "w.njeri@test.com"
        blood_type    = "A-"
        id_type       = "national_id"
        id_number     = "SIM6-$(Get-Random -Maximum 99999)"
        address       = @{ street = "Uhuru St"; city = "Thika"; state = "Kiambu County"; country = "Kenya" }
    }
    if (-not $patient) { return }

    $enc = Create-Encounter $Staff.ReceptionistSusan $patient.id $Clinic.Maternity $Staff.DrDavis "outpatient" "routine" "First antenatal visit, 16 weeks gestation" "insurance"
    if (-not $enc) { return }

    Triage-Patient $Staff.NurseMary $enc.id $patient.id "routine"

    $consultation = Run-Consultation `
        -doctorId $Staff.DrDavis `
        -encounterId $enc.id `
        -patientId $patient.id `
        -chiefComplaint "First antenatal visit, 16 weeks by LMP, mild nausea" `
        -diagnosis "Intrauterine pregnancy - 16 weeks, viable" `
        -treatmentPlan "Routine ANC, iron/folic acid supplementation, dating scan" `
        -vitals @{ bloodPressure="110/70"; temperature="36.6"; pulse="82"; respiratoryRate="18"; oxygenSaturation="99"; weight="62"; height="165" } `
        -examination @{
            generalAppearance = "Healthy-appearing gravida"
            abdominal         = "Fundal height consistent with dates, FHR 150bpm"
        } `
        -labOrders @(
            @{ testId = 1; priority = "routine"; clinicalNotes = "Baseline CBC - anemia screening" },
            @{ testId = 6; priority = "routine"; clinicalNotes = "Urine protein and glucose screening" }
        ) `
        -radiologyOrders @(
            @{ testId = 6; priority = "routine"; clinicalIndication = "Dating scan, viability, anomaly screening" }
        ) `
        -prescriptions @(
            @{ drugId = 7; dosage = "10mg"; frequency = "once daily"; duration = "30 days"; quantity = 30 },
            @{ drugId = 2; dosage = "500mg"; frequency = "PRN for nausea"; duration = "7 days"; quantity = 14 }
        )

    Process-Lab $Staff.LabJennifer $patient.id
    Process-Radiology $patient.id
    Process-Pharmacy $Staff.PharmThomas $patient.id
    Process-Billing $enc.id "insurance"
}


##############################################################################
# MAIN - Run all simulations
##############################################################################
Write-Host ""
Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "         MediMesh - MULTI-HOSPITAL WORKFLOW SIMULATIONS                 " -ForegroundColor Magenta
Write-Host "                                                                        " -ForegroundColor Magenta
Write-Host "  6 patients  x  6 clinics  x  12 staff members  x  every station      " -ForegroundColor Magenta
Write-Host "  Reception > Triage > Consultation > Lab > Radiology > Pharmacy > Bill " -ForegroundColor Magenta
Write-Host "========================================================================" -ForegroundColor Magenta

$startTime = Get-Date

Run-Simulation1   # Emergency Malaria      - General OPD
Run-Simulation2   # Cardiac Chest Pain     - Cardiology
Run-Simulation3   # Pediatric Pneumonia    - Children Clinic
Run-Simulation4   # Diabetic Follow-up     - Anderson Clinic
Run-Simulation5   # Surgical Abdomen       - Surgical Outpatient
Run-Simulation6   # Prenatal Visit         - Maternity Clinic

$elapsed = (Get-Date) - $startTime

# -- Final stats --------------------------------------------------------------
Write-Host ""
Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "                    SIMULATION RESULTS SUMMARY                          " -ForegroundColor Magenta
Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "  Patients simulated:   6" -ForegroundColor White
Write-Host "  Clinics used:         6 (GenOPD, Cardiology, Pediatric, Anderson," -ForegroundColor White
Write-Host "                           Surgical, Maternity)" -ForegroundColor White
Write-Host "  Staff involved:       12 (2 receptionists, 3 nurses, 5 doctors," -ForegroundColor White
Write-Host "                            2 lab techs, 1 pharmacist)" -ForegroundColor White

if ($script:errors -eq 0) { $color = "Green" } else { $color = "Red" }
Write-Host "  Steps passed:         $($script:passedSteps)/$($script:totalSteps)" -ForegroundColor $color
Write-Host "  Errors:               $($script:errors)" -ForegroundColor $color
Write-Host "  Total revenue:        KES $($script:totalRevenue)" -ForegroundColor Cyan
Write-Host "  Elapsed time:         $([math]::Round($elapsed.TotalSeconds, 1))s" -ForegroundColor White
Write-Host "========================================================================" -ForegroundColor Magenta

if ($script:errors -eq 0) {
    Write-Host "`n  ALL SIMULATIONS PASSED - Hospital workflow is fully operational!`n" -ForegroundColor Green
} else {
    Write-Host "`n  $($script:errors) error(s) detected - review output above.`n" -ForegroundColor Yellow
}
