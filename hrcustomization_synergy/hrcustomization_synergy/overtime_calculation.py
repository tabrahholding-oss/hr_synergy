import frappe
from frappe import _
from frappe.utils import getdate, flt

def get_holiday_list_for_employee(employee_doc, date):
    """
    Get the applicable holiday list for an employee on a specific date
    Priority: Shift Type > Employee > Company
    """
    holiday_list = None
    
    # First priority: Check if employee has a shift assignment for this date
    shift_assignment = frappe.db.sql("""
        SELECT shift_type
        FROM `tabShift Assignment` 
        WHERE employee = %s 
        AND %s BETWEEN start_date AND IFNULL(end_date, '2099-12-31')
        AND status = 'Active'
        ORDER BY creation DESC
        LIMIT 1
    """, (employee_doc.name, date), as_dict=True)
    
    if shift_assignment:
        shift_type = frappe.get_doc("Shift Type", shift_assignment[0].shift_type)
        if shift_type.holiday_list:
            holiday_list = shift_type.holiday_list
    
    # Second priority: Employee's holiday list
    if not holiday_list and employee_doc.holiday_list:
        holiday_list = employee_doc.holiday_list
    
    # Third priority: Company's default holiday list
    if not holiday_list:
        company_doc = frappe.get_doc("Company", employee_doc.company)
        if hasattr(company_doc, 'default_holiday_list') and company_doc.default_holiday_list:
            holiday_list = company_doc.default_holiday_list
    
    return holiday_list

def calculate_overtime_on_attendance(doc, method):
    """
    Calculate overtime hours when attendance is submitted
    Called via hooks on Attendance on_submit event
    """
    if doc.docstatus != 1:
        return
    
    if not doc.working_hours or doc.working_hours <= 0:
        return
    
    try:
        settings = frappe.get_single("Overtime Settings")
    except:
        return
    
    if not settings.auto_calculate_overtime:
        return
    
    employee = frappe.get_doc("Employee", doc.employee)
    
    # Check if employee is eligible for overtime
    if not employee.custom_overtime_eligible:
        return
    
    # Get the correct holiday list following ERPNext priority
    holiday_list = get_holiday_list_for_employee(employee, doc.attendance_date)
    
    if not holiday_list:
        # No holiday list found, treat as regular working day
        frappe.log_error(f"No holiday list found for employee {doc.employee} on {doc.attendance_date}", 
                        "Overtime Calculation Warning")
        # Continue with normal day calculation
        pass
    
    is_holiday = False
    is_public_holiday = False
    is_weekly_off = False
    
    # Check if this date is a holiday only if we have a holiday list
    if holiday_list:
        holidays = frappe.db.sql("""
            SELECT weekly_off, custom_public_holiday 
            FROM `tabHoliday` 
            WHERE parent = %s AND holiday_date = %s
        """, (holiday_list, doc.attendance_date), as_dict=True)
        
        if holidays:
            holiday = holidays[0]
            is_holiday = True
            is_weekly_off = holiday.get('weekly_off', 0)
            is_public_holiday = holiday.get('custom_public_holiday', 0)
    
    normal_ot = 0
    holiday_ot = 0
    special_ot = 0
    
    # Calculate effective working hours by deducting break time
    effective_working_hours = flt(doc.working_hours - (settings.daily_break_hours or 0), 2)
    
    if is_public_holiday:
        # For public holidays, consider full effective hours as special OT
        if effective_working_hours > 0:
            special_ot = effective_working_hours
            # Apply minimum threshold for special OT
            if special_ot < (settings.minimum_special_ot or 0):
                special_ot = 0
    elif is_weekly_off:
        # For weekly holidays, consider full effective hours as holiday OT
        if effective_working_hours > 0:
            holiday_ot = effective_working_hours
            # Apply minimum threshold for holiday OT
            if holiday_ot < (settings.minimum_holiday_ot or 0):
                holiday_ot = 0
    else:
        # For regular days, calculate normal OT above threshold
        if effective_working_hours > settings.daily_working_hours_threshold:
            calculated_normal_ot = flt(effective_working_hours - settings.daily_working_hours_threshold, 2)
            # Apply minimum threshold for normal OT
            if calculated_normal_ot >= (settings.minimum_normal_ot or 0):
                normal_ot = calculated_normal_ot
    
    total_calculated_ot = normal_ot + holiday_ot + special_ot
    
    if total_calculated_ot > 0:
        frappe.db.set_value("Attendance", doc.name, {
            "custom_calculated_ot_hours": total_calculated_ot
        })
        
        if not settings.require_approval_for_ot or total_calculated_ot < settings.minimum_ot_for_approval:
            frappe.db.set_value("Attendance", doc.name, {
                "custom_normal_ot": normal_ot,
                "custom_holiday_ot": holiday_ot,
                "custom_special_ot": special_ot,
                "custom_ot_approved": 1
            })

def validate_overtime_approval(doc, method):
    """
    Prevent manual editing of approved overtime fields
    Called via hooks on Attendance validate event
    """
    if doc.is_new():
        return
    
    # Skip validation if document is being submitted
    if doc.docstatus == 1:
        return
    
    old_doc = frappe.get_doc("Attendance", doc.name)
    
    if old_doc.custom_ot_approved and not frappe.session.user in ["Administrator"]:
        if (old_doc.custom_normal_ot != doc.custom_normal_ot or 
            old_doc.custom_holiday_ot != doc.custom_holiday_ot or 
            old_doc.custom_special_ot != doc.custom_special_ot):
            frappe.throw(_("Cannot modify approved overtime hours. Please cancel the approval request first."))