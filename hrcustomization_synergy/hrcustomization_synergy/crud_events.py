import frappe
from frappe import _

def fetch_overtime_details(doc, method):
    if doc.start_date and doc.end_date:
        result = frappe.db.sql(
            """
            SELECT 
                COALESCE(SUM(custom_normal_ot), 0) AS total_normal_ot,
                COALESCE(SUM(custom_holiday_ot), 0) AS total_holiday_ot,
                COALESCE(SUM(custom_special_ot), 0) AS total_special_ot
            FROM `tabAttendance`
            WHERE attendance_date BETWEEN %s AND %s
              AND employee = %s
              AND docstatus = 1
            """,
            (doc.start_date, doc.end_date, doc.employee),
            as_dict=True
        )
        
        totals = result[0] if result else {
            "total_normal_ot": 0,
            "total_holiday_ot": 0,
            "total_special_ot": 0
        }
        
        # doc.custom_total_normal_ot = totals.get("total_normal_ot", 0)
        # doc.custom_total_holiday_ot = totals.get("total_holiday_ot", 0)
        # doc.custom_total_special_ot = totals.get("total_special_ot", 0)
