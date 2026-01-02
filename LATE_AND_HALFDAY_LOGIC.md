# Late Arrival & Half-Day Work Logic

## Implementation Complete ✅

### New Features
1. **Late Arrival**: Check-in after 9:15 PM (22:15) = Status: **Late**
2. **Half-Day Work**: Check-in after 2:30 AM (02:30) = Status: **Half Day**

---

## Time Boundaries

| Time | Status | Notes |
|------|--------|-------|
| **21:00-22:15** | ✅ Present (On Time) | Evening check-in within grace period |
| **22:15-23:59** | ⏱️ Late | Evening late arrival - minutes counted |
| **00:00-02:30** | ✅ Present (On Time) | Early morning check-in before half-day cutoff |
| **02:30-06:00** | ⏰ Half Day | Early morning check-in after half-day threshold |
| **06:00-21:00** | ❌ Outside Hours | Not a valid check-in time |

---

## Examples

### Example 1: On-Time Evening Check-in
```
Employee: Ali
Check-in Time: 21:05 (9:05 PM)
Time in Minutes: 1265
Status: ✅ Present
Reason: Within 21:00-22:15 grace period
On Time: Yes
Late By: 0 minutes
```

### Example 2: Late Evening Check-in
```
Employee: Hassan
Check-in Time: 22:30 (10:30 PM)
Time in Minutes: 1350
Status: ⏱️ Late
Reason: After 22:15 grace period
On Time: No
Late By: 15 minutes
```

### Example 3: On-Time Early Morning Check-in
```
Employee: Fatima
Check-in Time: 01:15 (1:15 AM)
Time in Minutes: 75
Status: ✅ Present
Reason: Before 02:30 cutoff
On Time: Yes
Late By: 0 minutes
```

### Example 4: Half-Day Early Morning Check-in
```
Employee: Sara
Check-in Time: 03:45 (3:45 AM)
Time in Minutes: 225
Status: ⏰ Half Day
Reason: After 02:30 cutoff
On Time: No
Half Day: Yes
```

### Example 5: Boundary Case - Exactly at 02:30
```
Employee: Rafiya
Check-in Time: 02:30 (2:30 AM)
Time in Minutes: 150
Status: ✅ Present
Reason: Exactly at cutoff (not after)
On Time: Yes
Late By: 0 minutes
```

### Example 6: Half-Day - 1 Minute After Cutoff
```
Employee: Zara
Check-in Time: 02:31 (2:31 AM)
Time in Minutes: 151
Status: ⏰ Half Day
Reason: 1 minute after 02:30 cutoff
On Time: No
Half Day: Yes
```

---

## Priority Logic

When determining attendance status, the following priority is used:

1. **Half Day** (Highest Priority)
   - If check-in time > 02:30 AND check-in time <= 06:00
   - Applies to early morning late arrivals

2. **Late** (Medium Priority)
   - If check-in time > 22:15 AND check-in time <= 23:59
   - Applies to evening late arrivals

3. **Present** (Lowest Priority - Default)
   - If check-in time >= 21:00 AND check-in time <= 22:15
   - OR check-in time >= 00:00 AND check-in time <= 02:30
   - On-time status for both evening and early morning windows

---

## Code Changes

### File: `/Backend/routes/controllers/attendanceController.js`

**Location**: Lines 75-127 (checkIn function)

**Key Variables**:
```javascript
const lateAfterTime = 22 * 60 + 15;      // 22:15 = 1335 minutes
const halfDayAfterTime = 2 * 60 + 30;    // 02:30 = 150 minutes
const shiftStart = 21 * 60;               // 21:00 = 1260 minutes
```

**Status Determination**:
```javascript
// Half Day: After 02:30 AM
if (checkInTotalMinutes <= 6 * 60 && checkInTotalMinutes > halfDayAfterTime) {
  status = 'Half Day';
}
// Late: After 22:15 PM
else if (checkInTotalMinutes > lateAfterTime && checkInTotalMinutes <= 23 * 60 + 59) {
  status = 'Late';
}
// On Time: Within valid windows
else if (...) {
  status = 'Present';
}
```

---

## Database Changes

**No database schema changes required** - The `Employee_Attendance` table already has:
- `status` enum that includes 'Half Day'
- `late_by_minutes` field for tracking late minutes
- `on_time` field to indicate on-time status

---

## Testing

### Test Scenarios Verified ✅
1. ✅ On-time evening (21:05) → Status: Present
2. ✅ Late evening (22:30) → Status: Late, Late By: 15 minutes
3. ✅ On-time early morning (01:15) → Status: Present
4. ✅ Half-day early morning (03:45) → Status: Half Day
5. ✅ Boundary case (02:30) → Status: Present
6. ✅ Just after boundary (02:31) → Status: Half Day

---

## API Response Example

### Check-in Request
```bash
POST /api/v1/attendance/check-in
{
  "employee_id": 1,
  "email": "sara@digious.com",
  "name": "Sara Ahmed",
  "device_info": "Mobile",
  "ip_address": "192.168.1.1"
}
```

### Check-in at 03:45 (Half Day) - Response
```json
{
  "success": true,
  "message": "Check in successful",
  "data": {
    "id": 123,
    "employee_id": 1,
    "name": "Sara Ahmed",
    "email": "sara@digious.com",
    "check_in_time": "03:45:00",
    "attendance_date": "2026-01-02",
    "status": "Half Day",
    "isHalfDay": true,
    "onTime": 0
  }
}
```

### Check-in at 22:30 (Late) - Response
```json
{
  "success": true,
  "message": "Check in successful",
  "data": {
    "id": 124,
    "employee_id": 2,
    "name": "Hassan Raza",
    "email": "hassan@digious.com",
    "check_in_time": "22:30:00",
    "attendance_date": "2026-01-02",
    "status": "Late",
    "isLate": true,
    "lateByMinutes": 15,
    "onTime": 0
  }
}
```

---

## Summary

✅ **Late Arrival Logic**: After 22:15 (9:15 PM) → Status "Late"
✅ **Half-Day Logic**: After 02:30 (2:30 AM) → Status "Half Day"
✅ **Grace Period**: 21:00-22:15 (1 hour 15 minutes)
✅ **Early Morning Window**: 00:00-02:30 for on-time early arrivals
✅ **All Test Cases Passing**: 6/6 tests verified

---

**Implementation Date**: January 3, 2026
**Status**: ✅ Production Ready
