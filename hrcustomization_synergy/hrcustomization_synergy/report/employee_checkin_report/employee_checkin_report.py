import frappe
from frappe import _
from frappe.utils import getdate, formatdate


def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    
    return columns, data


def get_columns():
    """Define the columns for the Employee Checkin Report"""
    columns = [
        {
            "label": _("Employee Code"),
            "fieldname": "employee",
            "fieldtype": "Link",
            "options": "Employee",
            "width": 120
        },
        {
            "label": _("Employee Name"),
            "fieldname": "employee_name",
            "fieldtype": "Data",
            "width": 180
        },
        {
            "label": _("Date"),
            "fieldname": "attendance_date",
            "fieldtype": "Date",
            "width": 100
        },
        {
            "label": _("Time In"),
            "fieldname": "in_time",
            "fieldtype": "Time",
            "width": 100
        },
        {
            "label": _("Time Out"),
            "fieldname": "out_time",
            "fieldtype": "Time",
            "width": 100
        },
        {
            "label": _("Shift"),
            "fieldname": "shift",
            "fieldtype": "Link",
            "options": "Shift Type",
            "width": 120
        },
        {
            "label": _("Status"),
            "fieldname": "status",
            "fieldtype": "Data",
            "width": 100
        },
        {
            "label": _("Working Hours"),
            "fieldname": "working_hours",
            "fieldtype": "Float",
            "width": 100,
            "precision": 2
        },
        {
            "label": _("Expected Working Hours"),
            "fieldname": "expected_working_hours",
            "fieldtype": "Float",
            "width": 140,
            "precision": 2
        },
    ]
    
    return columns


def get_data(filters):
    """Fetch attendance data with employee checkin details"""
    from frappe.utils import getdate, time_diff_in_hours
    
    # Get attendance records
    conditions = get_conditions(filters)
    
    attendance_data = frappe.db.sql(f"""
        SELECT 
            a.employee,
            e.employee_name,
            a.attendance_date,
            a.shift,
            a.status,
            a.working_hours
        FROM `tabAttendance` a
        LEFT JOIN `tabEmployee` e ON a.employee = e.name
        WHERE a.docstatus = 1 {conditions}
        ORDER BY a.attendance_date DESC, a.employee
    """, as_dict=True)
    
    total_working_hours = 0
    total_expected_hours = 0
    
    # For each attendance record, get the first and last checkin times
    for record in attendance_data:
        # Get all checkins for this employee on this date
        checkins = frappe.db.sql("""
            SELECT 
                time
            FROM `tabEmployee Checkin`
            WHERE employee = %(employee)s
                AND DATE(time) = %(date)s
            ORDER BY time
        """, {
            'employee': record['employee'],
            'date': record['attendance_date']
        }, as_dict=True)
        
        if checkins:
            # First checkin is time in
            record['in_time'] = checkins[0]['time'].time() if checkins[0]['time'] else None
            # Last checkin is time out (if more than one checkin)
            record['out_time'] = checkins[-1]['time'].time() if len(checkins) > 1 and checkins[-1]['time'] else None
        else:
            record['in_time'] = None
            record['out_time'] = None
        
        # Expected working hours: 8 hours per day, 0 on Holiday
        expected_hours = 0 if record.get("status") == "Holiday" else 8
        record['expected_working_hours'] = expected_hours
        
        total_working_hours += record.get('working_hours') or 0
        total_expected_hours += expected_hours
    
    # Append total row at the end
    if attendance_data:
        attendance_data.append({
            "employee": "",
            "employee_name": _("Total"),
            "attendance_date": None,
            "in_time": None,
            "out_time": None,
            "shift": None,
            "status": "",
            "working_hours": total_working_hours,
            "expected_working_hours": total_expected_hours
        })
    
    return attendance_data


def get_conditions(filters):
    """Build SQL conditions based on filters"""
    conditions = ""
    
    if filters.get("employee"):
        conditions += f" AND a.employee = '{filters.get('employee')}'"
    
    if filters.get("from_date"):
        conditions += f" AND a.attendance_date >= '{filters.get('from_date')}'"
    
    if filters.get("to_date"):
        conditions += f" AND a.attendance_date <= '{filters.get('to_date')}'"
    
    if filters.get("department"):
        conditions += f" AND e.department = '{filters.get('department')}'"
    
    
    if filters.get("shift"):
        conditions += f" AND a.shift = '{filters.get('shift')}'"
    
    if filters.get("status"):
        conditions += f" AND a.status = '{filters.get('status')}'"
    
    return conditions