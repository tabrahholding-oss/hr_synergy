import frappe
import json
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate, flt
from hrcustomization_synergy.hrcustomization_synergy.overtime_calculation import get_holiday_list_for_employee


class OvertimeApprovalRequest(Document):
    def validate(self):
        if self.from_date > self.to_date:
            frappe.throw(_("From Date cannot be after To Date"))

        if not self.overtime_details:
            frappe.throw(_("Please fetch attendance records with overtime"))

        self.apply_normal_ot_limit()

    def apply_normal_ot_limit(self):
        """
        Row ki values aur per-day details (JSON) ko consistent karta hai:
        - Normal OT row limit: kam se kam = din, zyada se zyada = 3 x din
        - Per-day Normal OT: 0 ya 1 se 3
        - Row ki edit ki hui values details mein push hoti hain
        - Row ke totals hamesha details se dobara banate hain
        """
        for item in self.overtime_details:
            details = self._get_details(item)

            # Purani rows (details ke baghair): row par 1-3 limit
            if not details:
                if item.normal_ot_hours and item.normal_ot_hours < 1:
                    item.normal_ot_hours = 0
                elif item.normal_ot_hours and item.normal_ot_hours > 3:
                    item.normal_ot_hours = 3
                item.total_ot_hours = (
                    (item.normal_ot_hours or 0)
                    + (item.holiday_ot_hours or 0)
                    + (item.special_ot_hours or 0)
                )
                continue

            # 1) Row ki edit ki hui values ko details mein push karo
            self._push_row_values_to_details(item, details)

            # 2) Per-day Normal OT limit
            for d in details:
                value = flt(d.get("normal_ot_hours"))
                if value < 1:
                    value = 0
                elif value > 3:
                    value = 3
                d["normal_ot_hours"] = value

            # 3) Row ke totals details se
            item.normal_ot_hours = round(sum(flt(d.get("normal_ot_hours")) for d in details), 2)
            item.holiday_ot_hours = round(sum(flt(d.get("holiday_ot_hours")) for d in details), 2)
            item.special_ot_hours = round(sum(flt(d.get("special_ot_hours")) for d in details), 2)
            item.total_ot_hours = (
                item.normal_ot_hours + item.holiday_ot_hours + item.special_ot_hours
            )
            item.attendance_details = json.dumps(details)

    def _push_row_values_to_details(self, item, details):
        """Agar row ki value details ke total se alag hai (user ne row mein edit kiya),
        to usay din-ba-din details mein taqseem karo."""

        # ---- Normal OT: din = jin dinon mein normal OT hai ----
        days = [d for d in details if flt(d.get("normal_ot_hours")) > 0] or details
        n = len(days)
        row_normal = flt(item.normal_ot_hours)
        details_normal = sum(flt(d.get("normal_ot_hours")) for d in details)

        if abs(row_normal - details_normal) > 0.01:
            if row_normal > 0 and row_normal < n:
                row_normal = 0
            elif row_normal > 3 * n:
                row_normal = 3 * n

            for d in details:
                d["normal_ot_hours"] = 0

            if row_normal > 0:
                share = round(row_normal / n, 2)
                for i, d in enumerate(days):
                    if i < n - 1:
                        d["normal_ot_hours"] = share
                    else:
                        d["normal_ot_hours"] = round(row_normal - share * (n - 1), 2)

        # ---- Holiday / Special OT ----
        for field in ("holiday_ot_hours", "special_ot_hours"):
            row_value = max(flt(item.get(field)), 0)
            details_sum = sum(flt(d.get(field)) for d in details)

            if abs(row_value - details_sum) <= 0.01:
                continue

            if details_sum > 0:
                ratio = row_value / details_sum
                for d in details:
                    d[field] = round(flt(d.get(field)) * ratio, 2)
            else:
                # Pehle koi value nahi thi: pehle din par daal do (din tay karna ho to popup use karein)
                for i, d in enumerate(details):
                    d[field] = row_value if i == 0 else 0

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

            # Normal OT limit (per day)
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