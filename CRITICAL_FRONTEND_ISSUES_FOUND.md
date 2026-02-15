# 🚨 CRITICAL Frontend Issues Found

## Issue 1: Hardcoded localhost URLs (BREAKS IN PRODUCTION)

**Severity:** CRITICAL  
**Impact:** All these pages will fail in production

**Affected Files:**
1. `web-app/src/pages/QueueManagementPage.js`
2. `web-app/src/pages/WardOccupancyPage.js`
3. `web-app/src/pages/PharmacyManagementPage.js`
4. `web-app/src/pages/LabWorkflowPage.js`
5. `web-app/src/pages/BillingManagementPage.js`
6. `web-app/src/pages/RadiologyWorkflowPage.js`
7. `web-app/src/components/common/GlobalSearchBar.js`
8. `web-app/src/contexts/AuthContext.js`

**Problem:**
These files use hardcoded URLs like:
- `http://localhost:3001/api/...`
- `io('http://localhost:3001')`

**Solution:**
Use environment variable `process.env.REACT_APP_API_URL` or relative URLs

---

## Issue 2: Missing Error Notifications

**Severity:** MEDIUM  
**Impact:** Users won't see error messages when API calls fail

**Affected Files:**
- Most pages with fetch() calls don't show error notifications

---

## Issue 3: WebSocket Hardcoded URL

**Severity:** CRITICAL  
**Impact:** Real-time features won't work in production

**File:** `web-app/src/pages/QueueManagementPage.js`
**Problem:** `io('http://localhost:3001')` is hardcoded

---

## Fixing Now...

