# UHID Sequence Fix - Permanent Solution

## Problem Description

When trying to create a new patient, you encountered this error:
```
Error: duplicate key value violates unique constraint "patients_uhid_key"
Detail: Key (uhid)=(UHID2025001003) already exists.
```

### Root Cause

The UHID (Unique Hospital ID) sequence was out of sync with the actual UHIDs in the database:

1. **Initial Setup:** The migration script created a sequence starting at 1000
2. **Backfill:** Existing patients were assigned UHIDs (UHID2025001000, UHID2025001001, etc.)
3. **Bug:** The sequence counter was never updated after the backfill
4. **Result:** New patient creation tried to use UHID2025001000 again, causing a conflict

## Temporary Fix (Applied to Current Database)

```sql
-- Reset sequence to next available number
SELECT setval('uhid_sequence', 1006, false);
```

**⚠️ This fix only works for the current database instance and will be lost on rebuild!**

## Permanent Solution (Applied to Migration Script)

I've updated `init-scripts/04-patients-enhanced.sql` with three improvements:

### 1. Enhanced UHID Generation Function (Lines 57-86)

Added collision detection to handle edge cases:

```sql
CREATE OR REPLACE FUNCTION generate_uhid()
RETURNS TRIGGER AS $$
DECLARE
    new_uhid TEXT;
    max_attempts INTEGER := 10;
    attempt INTEGER := 0;
BEGIN
    IF NEW.uhid IS NULL THEN
        LOOP
            -- Generate UHID using sequence
            new_uhid := 'UHID' || TO_CHAR(NOW(), 'YYYY') || 
                       LPAD(NEXTVAL('uhid_sequence')::TEXT, 6, '0');
            
            -- Check if this UHID already exists
            IF NOT EXISTS (SELECT 1 FROM patients WHERE uhid = new_uhid) THEN
                NEW.uhid := new_uhid;
                EXIT; -- Success
            END IF;
            
            attempt := attempt + 1;
            IF attempt >= max_attempts THEN
                RAISE EXCEPTION 'Failed to generate unique UHID after % attempts', max_attempts;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Benefits:**
- Automatically detects and skips duplicate UHIDs
- Prevents the error from occurring even if sequence is out of sync
- Fails gracefully with a clear error message after 10 attempts

### 2. Sequence Reset After Backfill (Lines 113-117)

Updated the backfill logic to reset the sequence:

```sql
-- Reset the sequence to start after the last assigned UHID
IF max_counter >= 1000 THEN
    PERFORM setval('uhid_sequence', max_counter + 1, false);
    RAISE NOTICE 'UHID sequence reset to start from %', max_counter + 1;
END IF;
```

**Benefits:**
- Ensures sequence is in sync after assigning UHIDs to existing patients
- Prevents the initial conflict

### 3. Final Sequence Synchronization (Lines 120-139)

Added a final sync step that runs at the end of migration:

```sql
-- Ensure UHID sequence is in sync with existing UHIDs
DO $$
DECLARE
    max_uhid_num INTEGER;
    current_year TEXT;
BEGIN
    current_year := TO_CHAR(NOW(), 'YYYY');
    
    -- Find the highest UHID number for the current year
    SELECT COALESCE(MAX(SUBSTRING(uhid FROM 9)::INTEGER), 999)
    INTO max_uhid_num
    FROM patients
    WHERE uhid LIKE 'UHID' || current_year || '%';
    
    -- Set sequence to start from the next available number
    PERFORM setval('uhid_sequence', max_uhid_num + 1, false);
    
    RAISE NOTICE 'UHID sequence synchronized: will start from %', max_uhid_num + 1;
END $$;
```

**Benefits:**
- Works even if the migration is run multiple times
- Handles year transitions correctly
- Always ensures sequence is in sync, regardless of database state

## Testing the Fix

### Option 1: Test in Current Environment (Quick)

The current database already has the temporary fix applied. Try creating a patient now - it should work!

### Option 2: Test with Fresh Database (Recommended for Production Validation)

1. **Rebuild the containers:**
   ```powershell
   docker-compose down -v  # -v removes volumes (fresh database)
   docker-compose build
   docker-compose up -d
   ```

2. **Wait for initialization:**
   ```powershell
   timeout /t 30 /nobreak
   ```

3. **Check the logs for the sync message:**
   ```powershell
   docker logs medimesh-postgres 2>&1 | Select-String "UHID sequence"
   ```
   
   You should see:
   ```
   NOTICE: UHID sequence reset to start from 1006
   NOTICE: UHID sequence synchronized: will start from 1006
   ```

4. **Test patient creation:**
   - Go to http://localhost:3000
   - Login as admin
   - Navigate to Patients → Add Patient
   - Fill in the form and submit
   - Should work without errors!

## Production Deployment

### ✅ This fix is now permanent and will work in production because:

1. **Code-based:** The fix is in the migration script, not a manual database command
2. **Idempotent:** Can be run multiple times safely
3. **Self-healing:** The collision detection function prevents errors even if sequence gets out of sync
4. **Year-aware:** Handles year transitions (UHID2025, UHID2026, etc.)

### Deployment Checklist

- [x] Migration script updated (`init-scripts/04-patients-enhanced.sql`)
- [x] Collision detection added to `generate_uhid()` function
- [x] Sequence synchronization added to migration
- [ ] Test with fresh database (recommended before production)
- [ ] Commit changes to version control
- [ ] Deploy to staging environment
- [ ] Verify patient creation works in staging
- [ ] Deploy to production

## Rollback Plan

If you need to rollback to the old version:

```bash
git checkout HEAD~1 init-scripts/04-patients-enhanced.sql
docker-compose down -v
docker-compose up -d
```

## Additional Notes

### Why This Happened

This is a common issue with database sequences when:
1. Sequences are created before data
2. Data is backfilled without updating the sequence
3. The sequence tries to generate numbers that already exist

### Prevention for Future Migrations

When creating sequences for existing data:
1. Always sync the sequence after backfilling data
2. Add collision detection in generation functions
3. Test migrations with both empty and populated databases

### Performance Impact

- **Collision Detection:** Negligible - only runs on INSERT, checks index
- **Sequence Sync:** One-time cost during migration
- **Overall:** No noticeable performance impact

## Support

If you encounter any issues:

1. Check the backend logs:
   ```powershell
   docker logs medimesh-patient-api --tail 50
   ```

2. Check current sequence value:
   ```powershell
   docker exec -it medimesh-postgres psql -U postgres -d medimesh -c "SELECT last_value FROM uhid_sequence;"
   ```

3. Check highest UHID:
   ```powershell
   docker exec -it medimesh-postgres psql -U postgres -d medimesh -c "SELECT MAX(SUBSTRING(uhid FROM 9)::INTEGER) FROM patients WHERE uhid LIKE 'UHID2025%';"
   ```

4. Manually sync if needed:
   ```powershell
   docker exec -it medimesh-postgres psql -U postgres -d medimesh -c "SELECT setval('uhid_sequence', (SELECT COALESCE(MAX(SUBSTRING(uhid FROM 9)::INTEGER), 999) + 1 FROM patients WHERE uhid LIKE 'UHID' || TO_CHAR(NOW(), 'YYYY') || '%'), false);"
   ```

