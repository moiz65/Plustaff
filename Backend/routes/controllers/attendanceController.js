const pool = require('../../config/database');

// Record Check In
exports.checkIn = async (req, res) => {
  let connection;
  try {
    // Extract from both JWT (auth) and request body for flexibility
    // But prefer JWT employeeId for consistency with employee_onboarding.id
    const jwtEmployeeId = req.user?.employeeId; // From JWT token (auth middleware)
    const jwtUserId = req.user?.userId; // From JWT token (user_as_employees.id)
    const reqEmployeeId = req.body.employee_id; // From request body
    const { email, name, device_info, ip_address } = req.body;
    
    // Determine which employee_id to use
    // Priority: JWT employeeId > request employee_id
    let employee_id = jwtEmployeeId || reqEmployeeId;
    
    console.log('📥 Check-in request received:');
    console.log('   - JWT employeeId:', jwtEmployeeId);
    console.log('   - JWT userId:', jwtUserId);
    console.log('   - Request employee_id:', reqEmployeeId);
    console.log('   - Using employee_id:', employee_id);
    console.log('   - email:', email);
    console.log('   - name:', name);
    console.log('   - Full body:', req.body);

    if (!employee_id || !email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, email, and name are required'
      });
    }

    const now = new Date();
    const checkInTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const checkInHour = now.getHours();
    
    // Determine attendance date for night shift:
    // Night shift: 21:00 (9 PM) to 06:00 (6 AM) next day
    // If check-in is between 00:00-06:00, it belongs to the PREVIOUS day's shift
    // If check-in is between 21:00-23:59, it belongs to TODAY's shift
    let attendanceDate;
    if (checkInHour >= 0 && checkInHour < 6) {
      // Early morning (00:00-05:59) - belongs to yesterday's shift
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      attendanceDate = yesterday.toISOString().split('T')[0];
      console.log(`📅 Early morning check-in: Using YESTERDAY's date (${attendanceDate}) for night shift`);
    } else {
      // Evening/normal hours - use today
      attendanceDate = now.toISOString().split('T')[0];
      console.log(`📅 Evening check-in: Using TODAY's date (${attendanceDate})`);
    }

    connection = await pool.getConnection();

    try {
      // Check if attendance record already exists for the calculated attendance date
      const [existingAttendance] = await connection.query(
        `SELECT id, check_in_time FROM Employee_Attendance WHERE employee_id = ? AND attendance_date = ?`,
        [employee_id, attendanceDate]
      );

      if (existingAttendance.length > 0) {
        connection.release();
        return res.status(409).json({
          success: false,
          message: 'Already checked in today'
        });
      }

    const [checkInHourVal, checkInMin, checkInSec] = checkInTime.split(':').map(Number);
    const checkInTotalMinutes = checkInHourVal * 60 + checkInMin;
      
      // Time boundaries:
      // - Shift Start: 21:00 (1260 minutes) - Evening check-in
      // - Late After: 22:15 (1335 minutes) - Grace period ends, marked as Late
      const lateAfterTime = 22 * 60 + 15; // 22:15 = 1335 minutes
      const shiftStart = 21 * 60; // 21:00 = 1260 minutes
      
      let isLate = false;
      let lateByMinutes = 0;
      let status = 'Present';
      let onTime = 1; // Default to on time
      
      // Check if check-in is within valid shift hours (21:00 onwards for same day)
      // Valid check-in times: 21:00-23:59 (evening) or 00:00-06:00 (early morning)
      const isValidShiftTime = (checkInTotalMinutes >= shiftStart) || (checkInTotalMinutes <= 6 * 60);
      
      if (!isValidShiftTime) {
        console.log(`⚠️ Invalid Check In Time: ${name} at ${checkInTime} (outside shift hours 21:00-06:00)`);
      }
      
      // Determine attendance status based on check-in time
      // Simple Logic: Check in at or after 22:15 = Late (regardless of time)
      // Check in between 21:00-22:14 = Present (On Time)
      
      // Check for Late: If checked in at/after 22:15 (either evening or early morning)
      if (checkInTotalMinutes >= lateAfterTime && checkInTotalMinutes <= 23 * 60 + 59) {
        // Evening late: At or after 22:15 in evening
        isLate = true;
        lateByMinutes = checkInTotalMinutes - lateAfterTime;
        status = 'Late';
        onTime = 0;
        console.log(`⏱️ Late Check In: ${name} at ${checkInTime} (${lateByMinutes} minutes late - at/after 22:15 PM)`);
      } else if (checkInTotalMinutes >= 0 && checkInTotalMinutes <= 6 * 60) {
        // Early morning late (any check-in from 00:00-06:00 is considered late)
        isLate = true;
        status = 'Late';
        onTime = 0;
        // Calculate minutes late: from 22:15 (1335) to early morning time
        // For early morning: add 24 hours (1440 minutes) to make comparison work
        const earlyMorningMinutesFrom22_15 = (1440 - lateAfterTime) + checkInTotalMinutes;
        lateByMinutes = earlyMorningMinutesFrom22_15;
        console.log(`⏱️ Late Check In (Early Morning): ${name} at ${checkInTime} (${lateByMinutes} minutes late - after 22:15 PM)`);
      }
      // Check for On Time: If checked in between 21:00 and 22:14
      else if (checkInTotalMinutes >= shiftStart && checkInTotalMinutes < lateAfterTime) {
        // On time: between 21:00 and 22:14
        console.log(`✅ On Time Check In: ${name} at ${checkInTime} (between 21:00-22:14)`);
      }

      // Create new attendance record
      const [result] = await connection.query(
        `INSERT INTO Employee_Attendance 
         (employee_id, email, name, attendance_date, check_in_time, status, on_time, late_by_minutes, device_info, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [employee_id, email, name, attendanceDate, checkInTime, status, onTime, lateByMinutes, device_info || null, ip_address || null]
      );

      console.log(`✅ Check In: ${name} (${email}) at ${checkInTime} on ${attendanceDate}`);

      res.status(201).json({
        success: true,
        message: 'Check in successful',
        data: {
          id: result.insertId,
          employee_id,
          name,
          email,
          check_in_time: checkInTime,
          attendance_date: attendanceDate,
          status,
          isLate,
          lateByMinutes,
          onTime
        }
      });
    } finally {
      if (connection) connection.release();
    }
  } catch (error) {
    console.error('❌ Check In error:', error);
    if (connection) connection.release();
    res.status(500).json({
      success: false,
      message: 'Check in failed',
      error: error.message
    });
  }
};

// Record Check Out
exports.checkOut = async (req, res) => {
  let connection;
  try {
    // Extract from both JWT (auth) and request body for flexibility
    const jwtEmployeeId = req.user?.employeeId; // From JWT token
    const reqEmployeeId = req.body.employee_id; // From request body
    
    // Determine which employee_id to use - prefer JWT
    let employee_id = jwtEmployeeId || reqEmployeeId;
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    console.log('📤 Check-out request received:');
    console.log('   - JWT employeeId:', jwtEmployeeId);
    console.log('   - Request employee_id:', reqEmployeeId);
    console.log('   - Using employee_id:', employee_id);
    
    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }

    connection = await pool.getConnection();

    try {
      // Work date logic for night shift:
      // The night shift runs from 21:00 (9 PM) to 06:00 (6 AM) next day
      // Get today's date
      const todayStr = now.toISOString().split('T')[0];
      
      // First, try to find an active check-in for TODAY (current calendar day)
      const [attendanceRecordToday] = await connection.query(
        `SELECT id, check_in_time, total_break_duration_minutes FROM Employee_Attendance 
         WHERE employee_id = ? AND attendance_date = ? AND check_out_time IS NULL`,
        [employee_id, todayStr]
      );

      let attendanceRecord, workDateStr;
      
      if (attendanceRecordToday.length > 0) {
        // Found active check-in for TODAY - use it
        attendanceRecord = attendanceRecordToday;
        workDateStr = todayStr;
      } else {
        // No active check-in for today, try YESTERDAY (for morning check-outs)
        const yesterdayDate = new Date(now);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
        
        const [attendanceRecordYesterday] = await connection.query(
          `SELECT id, check_in_time, total_break_duration_minutes FROM Employee_Attendance 
           WHERE employee_id = ? AND attendance_date = ? AND check_out_time IS NULL`,
          [employee_id, yesterdayStr]
        );
        
        if (attendanceRecordYesterday.length > 0) {
          // Found active check-in for YESTERDAY - use it
          attendanceRecord = attendanceRecordYesterday;
          workDateStr = yesterdayStr;
        } else {
          // No active check-in found for either today or yesterday
          connection.release();
          return res.status(404).json({
            success: false,
            message: 'No active check in found for today'
          });
        }
      }

      const checkOutTime = new Date().toTimeString().split(' ')[0];
      const attendanceId = attendanceRecord[0].id;
      const checkInTime = attendanceRecord[0].check_in_time;
      const totalBreakMinutes = attendanceRecord[0].total_break_duration_minutes || 0;

      // Calculate working times
      // For night shift: if check-in is after 21:00 and check-out is before 06:00 NEXT DAY,
      // OR if check-in is after 21:00 and checkout is later same day
      const [checkInHour, checkInMin] = checkInTime.split(':').map(Number);
      const [checkOutHour, checkOutMin] = checkOutTime.split(':').map(Number);
      
      const checkInTotalMinutes = checkInHour * 60 + checkInMin;
      const checkOutTotalMinutes = checkOutHour * 60 + checkOutMin;
      
      let grossWorkingMinutes = 0;
      
      // Determine if this is a night shift based on check-in time
      const isNightShift = checkInTotalMinutes >= 21 * 60; // 21:00 or later
      
      if (isNightShift) {
        // Night shift: check-in at 21:00+ 
        // The key insight: if we found an active check-in on workDateStr,
        // and we're checking out now on the same workDateStr,
        // then this is either a same-night quick checkout or continues to next day
        
        // Calculate time difference for same-work-date scenarios
        const timeDifferenceMinutes = checkOutTotalMinutes - checkInTotalMinutes;
        
        if (timeDifferenceMinutes >= 0) {
          // Positive time difference: checkout is after check-in on same work date
          // Examples:
          // - 21:56:49 → 21:56:58 (9 seconds, same night)
          // - 21:00:00 → 23:30:00 (2.5 hours, same night)
          grossWorkingMinutes = timeDifferenceMinutes;
          console.log(`📊 Same-Work-Date Night Shift: ${checkInTime} → ${checkOutTime} = ${grossWorkingMinutes}min (${(grossWorkingMinutes/60).toFixed(2)}h)`);
        } else if (checkOutTotalMinutes < 6 * 60) {
          // Negative time difference BUT checkout is before 6 AM = next day early morning
          // Examples:
          // - Check-in 21:00:00 → Check-out 05:30:00 (next day morning)
          // - Check-in 23:30:00 → Check-out 04:00:00 (next day morning)
          const minutesUntilMidnight = (24 * 60) - checkInTotalMinutes; // Remaining today
          const minutesAfterMidnight = checkOutTotalMinutes; // Tomorrow morning
          grossWorkingMinutes = minutesUntilMidnight + minutesAfterMidnight;
          
          console.log(`📊 Normal Night Shift: Check-in ${checkInTime} → Check-out next day ${checkOutTime}`);
          console.log(`   Remaining today: ${minutesUntilMidnight}min, Tomorrow: ${minutesAfterMidnight}min, Total: ${grossWorkingMinutes}min`);
        } else {
          // Checkout is after 6 AM = next day afternoon checkout after night shift
          // Examples:
          // - Check-in 21:00 (Day 1) → Check-out 15:49 (Day 2 afternoon)
          const minutesUntilMidnight = (24 * 60) - checkInTotalMinutes;
          const minutesAfterMidnight = checkOutTotalMinutes;
          grossWorkingMinutes = minutesUntilMidnight + minutesAfterMidnight;
          
          console.log(`📊 Night Shift with Next-Day Afternoon Checkout:`);
          console.log(`   Check-in: ${checkInTime} (Day 1) → Check-out: ${checkOutTime} (Day 2 afternoon)`);
          console.log(`   Minutes until midnight: ${minutesUntilMidnight}min`);
          console.log(`   Minutes after midnight: ${minutesAfterMidnight}min`);
          console.log(`   Total: ${grossWorkingMinutes}min = ${(grossWorkingMinutes/60).toFixed(1)}h`);
        }
      } else {
        // Check-in is in early morning (before 21:00)
        // Checkout should also be on same day
        grossWorkingMinutes = checkOutTotalMinutes - checkInTotalMinutes;
        console.log(`📊 Day Shift: ${checkInTime} → ${checkOutTime} = ${grossWorkingMinutes}min`);
      }
      
      // Ensure no negative values
      grossWorkingMinutes = Math.max(0, grossWorkingMinutes);
      const netWorkingMinutes = Math.max(0, grossWorkingMinutes - totalBreakMinutes);
      
      // Calculate overtime
      const expectedWorkingMinutes = 540; // 9 hours
      let overtimeMinutes = 0;
      let overtimeHours = 0;
      
      // Overtime is calculated when net working time exceeds expected time
      if (netWorkingMinutes > expectedWorkingMinutes) {
        overtimeMinutes = netWorkingMinutes - expectedWorkingMinutes;
        overtimeHours = (overtimeMinutes / 60).toFixed(2);
        console.log(`📊 Overtime calculated: ${overtimeMinutes} minutes (${overtimeHours}h)`);
      } else {
        console.log(`⏱️ No overtime - worked ${(netWorkingMinutes/60).toFixed(1)}h out of expected 9h`);
      }

      // Update attendance record
      await connection.query(
        `UPDATE Employee_Attendance 
         SET check_out_time = ?,
             gross_working_time_minutes = ?,
             net_working_time_minutes = ?,
             overtime_minutes = ?,
             overtime_hours = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [checkOutTime, grossWorkingMinutes, netWorkingMinutes, overtimeMinutes, overtimeHours, attendanceId]
      );

      console.log(`✅ Check Out: Employee ${employee_id} at ${checkOutTime}`);

      res.status(200).json({
        success: true,
        message: 'Check out successful',
        data: {
          id: attendanceId,
          employee_id,
          check_out_time: checkOutTime,
          gross_working_time_minutes: grossWorkingMinutes,
          net_working_time_minutes: netWorkingMinutes,
          overtime_hours: parseFloat(overtimeHours),
          attendance_date: workDateStr
        }
      });
    } finally {
      if (connection) connection.release();
    }
  } catch (error) {
    console.error('❌ Check Out error:', error);
    if (connection) connection.release();
    res.status(500).json({
      success: false,
      message: 'Check out failed',
      error: error.message
    });
  }
};

// Generate Absent Records for all employees from joining date to today
exports.generateAbsentRecords = async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    
    console.log('🔄 Starting absent record generation...');
    
    // Get all active employees with their joining dates
    const [employees] = await connection.query(
      `SELECT employee_id, name, email, created_at as joining_date 
       FROM user_as_employees 
       WHERE status = 'Active'`
    );
    
    if (employees.length === 0) {
      connection.release();
      return res.status(200).json({
        success: true,
        message: 'No active employees found',
        data: { processed: 0, created: 0 }
      });
    }
    
    let totalProcessed = 0;
    let totalCreated = 0;
    
    for (const employee of employees) {
      const { employee_id, name, email, joining_date } = employee;
      
      // Calculate date range from joining to today
      const startDate = new Date(joining_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset to start of day
      
      console.log(`👤 Processing ${name} (ID: ${employee_id}) from ${startDate.toDateString()}`);
      
      // Get all existing attendance dates for this employee
      const [existingDates] = await connection.query(
        `SELECT DISTINCT DATE(attendance_date) as attendance_date FROM Employee_Attendance 
         WHERE employee_id = ? AND DATE(attendance_date) >= ? AND DATE(attendance_date) <= ?`,
        [employee_id, startDate.toISOString().split('T')[0], today.toISOString().split('T')[0]]
      );
      
      const existingDateSet = new Set(
        existingDates.map(row => {
          // Handle both DATE objects and string date values
          if (row.attendance_date instanceof Date) {
            return row.attendance_date.toISOString().split('T')[0];
          }
          return row.attendance_date;
        })
      );
      
      // Generate all dates from joining to today
      const currentDate = new Date(startDate);
      let createdForEmployee = 0;
      
      while (currentDate <= today) {
        const dateString = currentDate.toISOString().split('T')[0];
        
        // Skip weekends (optional - remove if you want to track weekend absences)
        const dayOfWeek = currentDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
        
        // If no attendance record exists for this date and it's not weekend
        if (!existingDateSet.has(dateString) && !isWeekend) {
          // First check if record already exists
          const [existingRecord] = await connection.query(
            `SELECT id FROM Employee_Attendance WHERE employee_id = ? AND attendance_date = ?`,
            [employee_id, dateString]
          );
          
          if (existingRecord.length === 0) {
            // Record doesn't exist, create it
            await connection.query(
              `INSERT INTO Employee_Attendance 
               (employee_id, email, name, attendance_date, status, 
                total_breaks_taken, smoke_break_count, dinner_break_count, 
                washroom_break_count, prayer_break_count, smoke_break_duration_minutes, 
                dinner_break_duration_minutes, washroom_break_duration_minutes, 
                prayer_break_duration_minutes, total_break_duration_minutes, 
                gross_working_time_minutes, net_working_time_minutes, overtime_minutes, 
                overtime_hours, on_time, late_by_minutes, created_at, updated_at) 
               VALUES (?, ?, ?, ?, 'Absent', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.00, 0, 0, NOW(), NOW())`,
              [employee_id, email, name, dateString]
            );
            
            createdForEmployee++;
            totalCreated++;
          }
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      console.log(`   ✅ Created ${createdForEmployee} absent records for ${name}`);
      totalProcessed++;
    }
    
    connection.release();
    
    console.log(`🎯 Absent record generation complete:`);
    console.log(`   📊 Processed ${totalProcessed} employees`);
    console.log(`   📝 Created ${totalCreated} absent records`);
    
    res.status(200).json({
      success: true,
      message: 'Absent records generated successfully',
      data: {
        processed: totalProcessed,
        created: totalCreated,
        employees: employees.map(emp => ({
          employee_id: emp.employee_id,
          name: emp.name,
          joining_date: emp.joining_date
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Generate Absent Records error:', error);
    if (connection) connection.release();
    res.status(500).json({
      success: false,
      message: 'Failed to generate absent records',
      error: error.message
    });
  }
};

// Record Break
exports.recordBreak = async (req, res) => {
  let connection;
  try {
    // Extract from both JWT (auth) and request body for flexibility
    const jwtEmployeeId = req.user?.employeeId; // From JWT token
    const reqEmployeeId = req.body.employee_id; // From request body
    
    // Determine which employee_id to use - prefer JWT
    let employee_id = jwtEmployeeId || reqEmployeeId;
    
    const { break_type, break_start_time, break_end_time, break_duration_minutes, reason } = req.body;
    const today = new Date().toISOString().split('T')[0];

    console.log('⏸️ Record break request received:');
    console.log('   - JWT employeeId:', jwtEmployeeId);
    console.log('   - Request employee_id:', reqEmployeeId);
    console.log('   - Using employee_id:', employee_id);

    if (!employee_id || !break_type) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and break type are required'
      });
    }

    const validBreakTypes = ['Smoke', 'Dinner', 'Washroom', 'Prayer', 'Other'];
    if (!validBreakTypes.includes(break_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid break type'
      });
    }

    connection = await pool.getConnection();

    try {
      // Get today's attendance record
      const [attendanceRecord] = await connection.query(
        `SELECT id, check_in_time FROM Employee_Attendance 
         WHERE employee_id = ? AND attendance_date = ? AND check_out_time IS NULL`,
        [employee_id, today]
      );

      if (attendanceRecord.length === 0) {
        if (connection) connection.release();
        return res.status(404).json({
          success: false,
          message: 'No active check in found for today'
        });
      }

      const attendanceId = attendanceRecord[0].id;
      const breakStart = break_start_time || new Date().toTimeString().split(' ')[0];
      const breakEnd = break_end_time || new Date().toTimeString().split(' ')[0];

      // Use provided duration or calculate it
      let breakDurationMinutes = break_duration_minutes;
      
      if (!breakDurationMinutes || breakDurationMinutes < 0) {
        // Calculate break duration as fallback
        const breakStartDate = new Date(`${today}T${breakStart}`);
        const breakEndDate = new Date(`${today}T${breakEnd}`);
        breakDurationMinutes = Math.floor((breakEndDate - breakStartDate) / 60000);
      }
      
      console.log('💾 Recording break - Duration sent by frontend:', break_duration_minutes, 'Calculated:', breakDurationMinutes);

      // Insert break record
      const [breakResult] = await connection.query(
        `INSERT INTO Employee_Breaks 
         (attendance_id, employee_id, break_type, break_start_time, break_end_time, break_duration_minutes, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [attendanceId, employee_id, break_type, breakStart, breakEnd, breakDurationMinutes, reason || null]
      );

      // Update attendance record with break count
      const fieldMap = {
        'Smoke': 'smoke_break_count',
        'Dinner': 'dinner_break_count',
        'Washroom': 'washroom_break_count',
        'Prayer': 'prayer_break_count',
        'Other': 'smoke_break_count'  // Default to smoke for Other types
      };

      const breakCountField = fieldMap[break_type];
      
      // Only update specific break duration field if it exists for this type
      let updateQueryParts;
      let queryParams;

      if (['Smoke', 'Dinner', 'Washroom', 'Prayer'].includes(break_type)) {
        const breakDurationField = break_type.toLowerCase() + '_break_duration_minutes';
        
        updateQueryParts = [
          'UPDATE Employee_Attendance',
          'SET total_breaks_taken = total_breaks_taken + 1,',
          `    ${breakCountField} = ${breakCountField} + 1,`,
          `    ${breakDurationField} = ${breakDurationField} + ?,`,
          '    total_break_duration_minutes = total_break_duration_minutes + ?,',
          '    updated_at = NOW()',
          'WHERE id = ?'
        ];
        queryParams = [breakDurationMinutes, breakDurationMinutes, attendanceId];
      } else {
        // For 'Other' type, only update total breaks and total duration
        updateQueryParts = [
          'UPDATE Employee_Attendance',
          'SET total_breaks_taken = total_breaks_taken + 1,',
          '    total_break_duration_minutes = total_break_duration_minutes + ?,',
          '    updated_at = NOW()',
          'WHERE id = ?'
        ];
        queryParams = [breakDurationMinutes, attendanceId];
      }
      
      const updateQuery = updateQueryParts.join('\n');
      
      console.log('🔍 Update Query:', updateQuery);
      console.log('📊 Parameters:', queryParams);
      
      await connection.query(updateQuery, queryParams);

      console.log(`✅ Break Recorded: ${break_type} for employee ${employee_id} (${breakDurationMinutes} min)`);

      res.status(201).json({
        success: true,
        message: 'Break recorded successfully',
        data: {
          id: breakResult.insertId,
          employee_id,
          break_type,
          break_start_time: breakStart,
          break_end_time: breakEnd,
          break_duration_minutes: breakDurationMinutes
        }
      });
    } finally {
      if (connection) connection.release();
    }
  } catch (error) {
    console.error('❌ Record Break error:', error);
    if (connection) connection.release();
    res.status(500).json({
      success: false,
      message: 'Failed to record break',
      error: error.message
    });
  }
};

// Get Today's Attendance
exports.getTodayAttendance = async (req, res) => {
  try {
    const { employee_id } = req.params;
    const now = new Date();
    const currentHour = now.getHours();
    
    // For night shift: if current time is 00:00-06:00, check YESTERDAY's attendance
    // Because night shift runs from 21:00 Day1 to 06:00 Day2
    let searchDate;
    if (currentHour >= 0 && currentHour < 6) {
      // Early morning - look for yesterday's shift
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      searchDate = yesterday.toISOString().split('T')[0];
      console.log(`📅 getTodayAttendance [EARLY MORNING] - Searching YESTERDAY's date: ${searchDate}`);
    } else {
      // Normal hours - look for today's shift
      searchDate = now.toISOString().split('T')[0];
      console.log(`📅 getTodayAttendance [NORMAL HOURS] - Searching TODAY's date: ${searchDate}`);
    }

    console.log(`📅 getTodayAttendance - Looking for employee_id: ${employee_id}, date: ${searchDate}`);

    const connection = await pool.getConnection();

    try {
      const [attendance] = await connection.query(
        `SELECT * FROM Employee_Attendance WHERE employee_id = ? AND attendance_date = ?`,
        [employee_id, searchDate]
      );

      if (attendance.length === 0) {
        console.log(`⚠️ No attendance record found for employee_id: ${employee_id} on date: ${searchDate}`);
        
        // Try to find if employee exists at all
        const [employeeCheck] = await connection.query(
          `SELECT id, employee_id as emp_id, name, email FROM user_as_employees WHERE id = ?`,
          [employee_id]
        );
        
        if (employeeCheck.length === 0) {
          console.log(`❌ Employee not found in user_as_employees with id: ${employee_id}`);
        } else {
          console.log(`ℹ️ Employee found: ${employeeCheck[0].emp_id} (${employeeCheck[0].name})`);
        }
        
        return res.status(404).json({
          success: false,
          message: 'No attendance record for today',
          employee_id: employee_id
        });
      }

      const record = attendance[0];
      const [breaks] = await connection.query(
        `SELECT * FROM Employee_Breaks WHERE attendance_id = ? ORDER BY break_start_time ASC`,
        [record.id]
      );

      // Format attendance_date to preserve local date (not UTC)
      const localDateStr = (() => {
        const d = record.attendance_date instanceof Date ? record.attendance_date : new Date(record.attendance_date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })();

      res.status(200).json({
        success: true,
        message: 'Today attendance data',
        data: {
          ...record,
          attendance_date: localDateStr,
          breaks: breaks
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Get Today Attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance data',
      error: error.message
    });
  }
};

// Get Monthly Attendance Summary
exports.getMonthlyAttendance = async (req, res) => {
  try {
    const { employee_id } = req.params;
    const { year, month } = req.query;

    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    const connection = await pool.getConnection();

    try {
      const [monthlyData] = await connection.query(
        `SELECT * FROM Employee_Attendance 
         WHERE employee_id = ? AND YEAR(attendance_date) = ? AND MONTH(attendance_date) = ?
         ORDER BY attendance_date ASC`,
        [employee_id, currentYear, currentMonth]
      );

      // Convert dates to proper format for frontend (keeping local date, not UTC)
      // The database stores local dates but MySQL returns them as JS Date objects
      // When serialized to JSON, they become UTC ISO strings which shift the date by 5 hours
      // We fix this by converting to YYYY-MM-DD format before sending
      const formattedData = monthlyData.map(record => ({
        ...record,
        attendance_date: record.attendance_date instanceof Date 
          ? record.attendance_date.toISOString().split('T')[0]  // This will still have timezone issue
          : record.attendance_date,
        // Better approach: use the local date components
        _attendance_date_local: (() => {
          const d = record.attendance_date instanceof Date ? record.attendance_date : new Date(record.attendance_date);
          // Get local date components using Date methods that respect local timezone
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        })()
      }));

      // Use the local date format for API response
      const responseData = formattedData.map(record => ({
        ...record,
        attendance_date: record._attendance_date_local,
        _attendance_date_local: undefined  // Remove temp field
      }));

      res.status(200).json({
        success: true,
        message: 'Monthly attendance data',
        data: responseData,
        summary: {
          year: currentYear,
          month: currentMonth,
          total_days: responseData.length,
          present_days: responseData.filter(r => r.status === 'Present').length,
          absent_days: responseData.filter(r => r.status === 'Absent').length,
          late_days: responseData.filter(r => r.status === 'Late').length
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Get Monthly Attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch monthly attendance',
      error: error.message
    });
  }
};

// Get All Attendance Records (Admin)
exports.getAllAttendance = async (req, res) => {
  try {
    const { date, status, limit = 50, page = 1 } = req.query;

    const connection = await pool.getConnection();

    try {
      let query = `SELECT * FROM Employee_Attendance WHERE 1=1`;
      const params = [];

      if (date) {
        query += ` AND attendance_date = ?`;
        params.push(date);
      }

      if (status) {
        query += ` AND status = ?`;
        params.push(status);
      }

      query += ` ORDER BY attendance_date DESC, employee_id ASC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

      const [attendance] = await connection.query(query, params);

      // Fetch breaks for each attendance record
      const attendanceWithBreaks = await Promise.all(
        attendance.map(async (record) => {
          const [breaks] = await connection.query(
            `SELECT id, break_type, break_start_time, break_end_time, break_duration_minutes, reason 
             FROM Employee_Breaks 
             WHERE attendance_id = ? 
             ORDER BY break_start_time ASC`,
            [record.id]
          );
          
          return {
            ...record,
            breaks: breaks || [],
            total_breaks_count: breaks ? breaks.length : 0
          };
        })
      );

      res.status(200).json({
        success: true,
        message: 'All attendance records',
        data: attendanceWithBreaks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: attendanceWithBreaks.length
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Get All Attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance records',
      error: error.message
    });
  }
};

// Get All Attendance with Absent Records (includes all employees)
exports.getAllAttendanceWithAbsent = async (req, res) => {
  try {
    const { date, status, limit = 100, page = 1 } = req.query;

    const connection = await pool.getConnection();

    try {
      // First get all active employees
      const [allEmployees] = await connection.query(
        `SELECT id, employee_id, name, email, department, status FROM employee_onboarding WHERE status = 'Active'`
      );

      let attendanceQuery = `SELECT * FROM Employee_Attendance WHERE 1=1`;
      const attendanceParams = [];

      if (date) {
        attendanceQuery += ` AND attendance_date = ?`;
        attendanceParams.push(date);
      }

      if (status) {
        attendanceQuery += ` AND status = ?`;
        attendanceParams.push(status);
      }

      attendanceQuery += ` ORDER BY attendance_date DESC, employee_id ASC`;

      const [attendance] = await connection.query(attendanceQuery, attendanceParams);

      // Fetch breaks for each attendance record
      const attendanceWithBreaks = await Promise.all(
        attendance.map(async (record) => {
          const [breaks] = await connection.query(
            `SELECT id, break_type, break_start_time, break_end_time, break_duration_minutes, reason 
             FROM Employee_Breaks 
             WHERE attendance_id = ? 
             ORDER BY break_start_time ASC`,
            [record.id]
          );
          
          return {
            ...record,
            breaks: breaks || [],
            total_breaks_count: breaks ? breaks.length : 0
          };
        })
      );

      // If date filter is applied, create absent records for employees who haven't checked in
      let completeAttendanceData = attendanceWithBreaks;
      
      if (date) {
        const attendanceEmployeeIds = new Set(attendance.map(a => a.employee_id));
        
        // Add absent records for employees who didn't check in
        const absentRecords = allEmployees
          .filter(emp => !attendanceEmployeeIds.has(emp.id))
          .map(emp => ({
            id: null,
            employee_id: emp.id,
            email: emp.email,
            name: emp.name,
            attendance_date: date,
            check_in_time: null,
            check_out_time: null,
            status: 'Absent',
            total_breaks_taken: 0,
            smoke_break_count: 0,
            dinner_break_count: 0,
            washroom_break_count: 0,
            prayer_break_count: 0,
            smoke_break_duration_minutes: 0,
            dinner_break_duration_minutes: 0,
            washroom_break_duration_minutes: 0,
            prayer_break_duration_minutes: 0,
            total_break_duration_minutes: 0,
            gross_working_time_minutes: 0,
            net_working_time_minutes: 0,
            expected_working_time_minutes: 540,
            overtime_minutes: 0,
            overtime_hours: '0.00',
            on_time: 0,
            late_by_minutes: 0,
            remarks: 'No check-in',
            device_info: null,
            ip_address: null,
            created_at: null,
            updated_at: null,
            breaks: [],
            total_breaks_count: 0
          }));

        completeAttendanceData = [...attendanceWithBreaks, ...absentRecords].sort((a, b) => {
          if (a.name !== b.name) return a.name.localeCompare(b.name);
          return (a.status || 'Z').localeCompare(b.status || 'Z');
        });
      }

      // Apply pagination
      const startIdx = (parseInt(page) - 1) * parseInt(limit);
      const endIdx = startIdx + parseInt(limit);
      const paginatedData = completeAttendanceData.slice(startIdx, endIdx);

      res.status(200).json({
        success: true,
        message: 'All attendance records with absent status',
        data: paginatedData,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: completeAttendanceData.length,
          total_active_employees: allEmployees.length
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Get All Attendance With Absent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance records',
      error: error.message
    });
  }
};

// Get Attendance Summary View
exports.getAttendanceSummary = async (req, res) => {
  try {
    const { employee_id, start_date, end_date } = req.query;

    const connection = await pool.getConnection();

    try {
      let query = `SELECT * FROM Attendance_Summary_View WHERE 1=1`;
      const params = [];

      if (employee_id) {
        query += ` AND employee_id = ?`;
        params.push(employee_id);
      }

      if (start_date) {
        query += ` AND attendance_date >= ?`;
        params.push(start_date);
      }

      if (end_date) {
        query += ` AND attendance_date <= ?`;
        params.push(end_date);
      }

      const [summary] = await connection.query(query, params);

      res.status(200).json({
        success: true,
        message: 'Attendance summary',
        data: summary
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Get Attendance Summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance summary',
      error: error.message
    });
  }
};

// Get Overtime Report
exports.getOvertimeReport = async (req, res) => {
  try {
    const { employee_id, start_date, end_date } = req.query;

    const connection = await pool.getConnection();

    try {
      let query = `SELECT * FROM Overtime_Report_View WHERE 1=1`;
      const params = [];

      if (employee_id) {
        query += ` AND employee_id = ?`;
        params.push(employee_id);
      }

      if (start_date) {
        query += ` AND attendance_date >= ?`;
        params.push(start_date);
      }

      if (end_date) {
        query += ` AND attendance_date <= ?`;
        params.push(end_date);
      }

      const [overtimeData] = await connection.query(query, params);

      // Calculate totals
      const totalOvertimeMinutes = overtimeData.reduce((sum, row) => sum + (row.overtime_minutes || 0), 0);
      const totalOvertimeHours = (totalOvertimeMinutes / 60).toFixed(2);

      res.status(200).json({
        success: true,
        message: 'Overtime report',
        data: overtimeData,
        summary: {
          total_overtime_hours: parseFloat(totalOvertimeHours),
          total_overtime_days: overtimeData.length,
          average_overtime_per_day: (totalOvertimeHours / overtimeData.length).toFixed(2)
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
      console.error('❌ Get Overtime Report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch overtime report',
      error: error.message
    });
  }
};

// Get all breaks
exports.getAllBreaks = async (req, res) => {
  try {
    const connection = await pool.getConnection();

    try {
      const [breaks] = await connection.query(
        `SELECT eb.*, eo.name as employee_name 
         FROM Employee_Breaks eb
         LEFT JOIN employee_onboarding eo ON eb.employee_id = eo.id
         ORDER BY eb.break_start_time DESC`
      );

      res.status(200).json({
        success: true,
        message: 'All breaks retrieved successfully',
        data: breaks,
        count: breaks.length
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Get All Breaks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch breaks',
      error: error.message
    });
  }
};