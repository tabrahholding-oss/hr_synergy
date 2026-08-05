import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate
from hrcustomization_synergy.hrcustomization_synergy.overtime_calculation import get_holiday_list_for_employee

class OvertimeApprovalRequest(Document):
    def validate(self):
        if self.from_date > self.to_date:
            frappe.throw(_("From Date cannot be after To Date"))
        
        if not self.overtime_details:
            frappe.throw(_("Please fetch attendance records with overtime"))
    
    def on_submit(self):
        if self.status != "Approved":
            frappe.throw(_("Only approved requests can be submitted"))
        
        self.update_attendance_records()
    
    def on_cancel(self):
        self.clear_attendance_overtime()
    
    def update_attendance_records(self):
        for item in self.overtime_details:
            if item.attendance:
                # Use db.set_value for submitted documents
                frappe.db.set_value("Attendance", item.attendance, {
                    "custom_normal_ot": item.normal_ot_hours,
                    "custom_holiday_ot": item.holiday_ot_hours,
                    "custom_special_ot": item.special_ot_hours,
                    "custom_ot_approved": 1,
                    "custom_ot_approval_request": self.name
                }, update_modified=False)
        
        frappe.db.commit()
        frappe.msgprint(_("Overtime hours updated in {0} attendance records").format(len(self.overtime_details)))
    
    def clear_attendance_overtime(self):
        for item in self.overtime_details:
            if item.attendance:
                # Use db.set_value for submitted documents
                frappe.db.set_value("Attendance", item.attendance, {
                    "custom_normal_ot": 0,
                    "custom_holiday_ot": 0,
                    "custom_special_ot": 0,
                    "custom_ot_approved": 0,
                    "custom_ot_approval_request": ""
                }, update_modified=False)
        
        frappe.db.commit()
    
    @frappe.whitelist()
    def fetch_overtime_records(self):
        settings = frappe.get_single("Overtime Settings")
        if not settings.auto_calculate_overtime:
            frappe.throw(_("Auto Calculate Overtime is disabled in settings"))
        
        # Check agar company select nahi ki gayi
        if not self.custom_company:
            frappe.throw(_("Please select a Company first"))

        conditions = []
        conditions.append("a.docstatus = 1")
        conditions.append("a.attendance_date BETWEEN %(from_date)s AND %(to_date)s")
        conditions.append("(a.custom_ot_approved = 0 OR a.custom_ot_approved IS NULL)")
        conditions.append("e.custom_overtime_eligible = 1")
        
        # --- NAYA FILTER: Company Filter ---
        conditions.append("e.company = %(company)s")
        
        values = {
            "from_date": self.from_date,
            "to_date": self.to_date,
            "threshold": settings.daily_working_hours_threshold,
            "company": self.custom_company # Value yahan pass ho rahi hai
        }
        
        if self.department:
            conditions.append("e.department = %(department)s")
            values["department"] = self.department
        
        if self.employee:
            conditions.append("a.employee = %(employee)s")
            values["employee"] = self.employee
        
        # Baki query waisi hi rahegi
        query = """
            SELECT 
                a.name as attendance,
                a.employee,
                a.employee_name,
                a.attendance_date,
                a.working_hours,
                e.department,
                e.company
            FROM `tabAttendance` a
            INNER JOIN `tabEmployee` e ON a.employee = e.name
            WHERE {conditions}
                AND a.working_hours > 0
            ORDER BY a.attendance_date, a.employee
        """.format(conditions=" AND ".join(conditions))
        
        records = frappe.db.sql(query, values, as_dict=True)
        
        self.overtime_details = []
        for record in records:
            # Get employee document for holiday list checking
            employee = frappe.get_doc("Employee", record.employee)
            
            # Calculate effective working hours
            effective_working_hours = record.working_hours - (settings.daily_break_hours or 0)
            if effective_working_hours <= 0:
                continue
            
            # Get correct holiday list (Custom function/helper assumed to be imported)
            holiday_list = get_holiday_list_for_employee(employee, record.attendance_date)
            
            is_holiday = False
            is_public_holiday = False
            is_weekly_off = False
            
            if holiday_list:
                holidays = frappe.db.sql("""
                    SELECT weekly_off, custom_public_holiday 
                    FROM `tabHoliday` 
                    WHERE parent = %s AND holiday_date = %s
                """, (holiday_list, record.attendance_date), as_dict=True)
                
                if holidays:
                    holiday = holidays[0]
                    is_holiday = True
                    is_weekly_off = holiday.get('weekly_off', 0)
                    is_public_holiday = holiday.get('custom_public_holiday', 0)
            
            # Calculate overtime hours
            normal_ot_hours = 0
            holiday_ot_hours = 0
            special_ot_hours = 0
            
            if is_public_holiday:
                if effective_working_hours >= (settings.minimum_special_ot or 0):
                    special_ot_hours = effective_working_hours
            elif is_weekly_off:
                if effective_working_hours >= (settings.minimum_holiday_ot or 0):
                    holiday_ot_hours = effective_working_hours
            else:
                if effective_working_hours > settings.daily_working_hours_threshold:
                    calculated_ot = effective_working_hours - settings.daily_working_hours_threshold
                    if calculated_ot >= (settings.minimum_normal_ot or 0):
                        normal_ot_hours = calculated_ot
            
            if normal_ot_hours > 0 or holiday_ot_hours > 0 or special_ot_hours > 0:
                projects = frappe.db.sql("""
                    SELECT DISTINCT custom_project
                    FROM `tabEmployee Checkin`
                    WHERE attendance = %s AND custom_project IS NOT NULL AND custom_project != ''
                """, record.attendance, as_dict=True)
                project_list = ", ".join([p.custom_project for p in projects if p.custom_project])

                self.append("overtime_details", {
                    "employee": record.employee,
                    "employee_name": record.employee_name,
                    "attendance_date": record.attendance_date,
                    "department": record.department,
                    "working_hours": record.working_hours,
                    "normal_ot_hours": normal_ot_hours,
                    "holiday_ot_hours": holiday_ot_hours,
                    "special_ot_hours": special_ot_hours,
                    "attendance": record.attendance,
                    "project": project_list
                })
        
        if not self.overtime_details:
            frappe.msgprint(_("No overtime records found for company {0}").format(self.custom_company))
        else:
            frappe.msgprint(_("Fetched {0} overtime records").format(len(self.overtime_details)))
            
        # YEH LINE ADD KAREIN:
        return self.overtime_details
