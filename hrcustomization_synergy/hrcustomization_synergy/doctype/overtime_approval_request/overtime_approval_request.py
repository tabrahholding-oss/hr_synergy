import frappe
import json
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

        self.apply_normal_ot_limit()

    def apply_normal_ot_limit(self):
        for item in self.overtime_details:
            if item.normal_ot_hours and item.normal_ot_hours < 1:
                item.normal_ot_hours = 0
            elif item.normal_ot_hours and item.normal_ot_hours > 3:
                item.normal_ot_hours = 3

            item.total_ot_hours = (
                (item.normal_ot_hours or 0)
                + (item.holiday_ot_hours or 0)
                + (item.special_ot_hours or 0)
            )

    def on_submit(self):
        if self.status != "Approved":
            frappe.throw(_("Only approved requests can be submitted"))
        self.update_attendance_records()

    def on_cancel(self):
        self.clear_attendance_overtime()

    def _get_details(self, item):
        """Row ke JSON details ko safely parse karo"""
        try:
            return json.loads(item.attendance_details or "[]")
        except Exception:
            return []

    def update_attendance_records(self):
        count = 0
        for item in self.overtime_details:
            for d in self._get_details(item):
                if d.get("attendance"):
                    frappe.db.set_value("Attendance", d["attendance"], {
                        "custom_normal_ot": d.get("normal_ot_hours", 0),
                        "custom_holiday_ot": d.get("holiday_ot_hours", 0),
                        "custom_special_ot": d.get("special_ot_hours", 0),
                        "custom_ot_approved": 1,
                        "custom_ot_approval_request": self.name
                    }, update_modified=False)
                    count += 1

        frappe.db.commit()
        frappe.msgprint(_("Overtime hours updated in {0} attendance records").format(count))

    def clear_attendance_overtime(self):
        for item in self.overtime_details:
            for d in self._get_details(item):
                if d.get("attendance"):
                    frappe.db.set_value("Attendance", d["attendance"], {
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

        if not self.custom_company:
            frappe.throw(_("Please select a Company first"))

        conditions = [
            "a.docstatus = 1",
            "a.attendance_date BETWEEN %(from_date)s AND %(to_date)s",
            "(a.custom_ot_approved = 0 OR a.custom_ot_approved IS NULL)",
            "e.custom_overtime_eligible = 1",
            "e.company = %(company)s",
        ]

        values = {
            "from_date": self.from_date,
            "to_date": self.to_date,
            "threshold": settings.daily_working_hours_threshold,
            "company": self.custom_company,
        }

        if self.department:
            conditions.append("e.department = %(department)s")
            values["department"] = self.department

        if self.employee:
            conditions.append("a.employee = %(employee)s")
            values["employee"] = self.employee

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
            ORDER BY a.employee, a.attendance_date
        """.format(conditions=" AND ".join(conditions))

        records = frappe.db.sql(query, values, as_dict=True)

        # ---- Employee ke hisaab se group karo ----
        employee_groups = {}

        for record in records:
            employee = frappe.get_doc("Employee", record.employee)

            effective_working_hours = record.working_hours - (settings.daily_break_hours or 0)
            if effective_working_hours <= 0:
                continue

            holiday_list = get_holiday_list_for_employee(employee, record.attendance_date)
            is_holiday = False
            is_public_holiday = False
            is_weekly_off = False

            if holiday_list:
                holidays = frappe.db.sql("""
                    SELECT weekly_off
                    FROM `tabHoliday`
                    WHERE parent = %s AND holiday_date = %s
                """, (holiday_list, record.attendance_date), as_dict=True)

                if holidays:
                    holiday = holidays[0]
                    is_holiday = True
                    is_weekly_off = holiday.get("weekly_off", 0)

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

            # Normal OT limit
            if normal_ot_hours < 1:
                normal_ot_hours = 0
            elif normal_ot_hours > 3:
                normal_ot_hours = 3

            # Project fetch
            projects = frappe.db.sql("""
                SELECT DISTINCT custom_project
                FROM `tabEmployee Checkin`
                WHERE attendance = %s AND custom_project IS NOT NULL AND custom_project != ''
            """, record.attendance, as_dict=True)
            project_list = ", ".join([p.custom_project for p in projects if p.custom_project])

            has_overtime = normal_ot_hours > 0 or holiday_ot_hours > 0 or special_ot_hours > 0
            if not has_overtime:
                continue

            # Detail entry (popup ke liye)
            detail = {
                "attendance_date": str(record.attendance_date),
                "working_hours": record.working_hours,
                "normal_ot_hours": normal_ot_hours,
                "holiday_ot_hours": holiday_ot_hours,
                "special_ot_hours": special_ot_hours,
                "attendance": record.attendance,
                "project": project_list,
            }

            if record.employee not in employee_groups:
                employee_groups[record.employee] = {
                    "employee": record.employee,
                    "employee_name": record.employee_name,
                    "department": record.department,
                    "working_hours": 0,
                    "normal_ot_hours": 0,
                    "holiday_ot_hours": 0,
                    "special_ot_hours": 0,
                    "projects": set(),
                    "details": [],
                }

            g = employee_groups[record.employee]
            g["working_hours"] += record.working_hours
            g["normal_ot_hours"] += normal_ot_hours
            g["holiday_ot_hours"] += holiday_ot_hours
            g["special_ot_hours"] += special_ot_hours
            if project_list:
                g["projects"].add(project_list)
            g["details"].append(detail)

        # ---- Grouped rows append karo ----
        self.overtime_details = []
        for emp, g in employee_groups.items():
            total_ot = g["normal_ot_hours"] + g["holiday_ot_hours"] + g["special_ot_hours"]
            if total_ot <= 0:
                continue

            self.append("overtime_details", {
                "employee": g["employee"],
                "employee_name": g["employee_name"],
                "department": g["department"],
                "working_hours": g["working_hours"],
                "normal_ot_hours": g["normal_ot_hours"],
                "holiday_ot_hours": g["holiday_ot_hours"],
                "special_ot_hours": g["special_ot_hours"],
                "total_ot_hours": total_ot,
                "project": ", ".join(sorted(g["projects"])),
                "attendance_details": json.dumps(g["details"]),
            })

        if not self.overtime_details:
            frappe.msgprint(_("No overtime records found for company {0}").format(self.custom_company))
        else:
            frappe.msgprint(_("Fetched {0} employee(s) with overtime").format(len(self.overtime_details)))

        return self.overtime_details