import frappe
import json
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate, flt
from hrcustomization_synergy.hrcustomization_synergy.overtime_calculation import get_holiday_list_for_employee


class OvertimeApprovalRequest(Document):
    def validate(self):
        if self.from_date > self.to_date:
            frappe.throw(_("From Date cannot be after To Date."))

        if not self.overtime_details:
            frappe.throw(_("Please fetch attendance records with overtime."))

        self.sync_overtime_details()

    def sync_overtime_details(self):
        """
        Keeps row values and per-day details (JSON) consistent:
        - A value edited at row level is applied only to that row's "OT Edit Date" day
        - Row totals are always rebuilt from the details
        """
        for item in self.overtime_details:
            details = self._get_details(item)

            # Legacy rows without details: only recompute the total
            if not details:
                item.total_ot_hours = (
                    (item.normal_ot_hours or 0)
                    + (item.holiday_ot_hours or 0)
                    + (item.special_ot_hours or 0)
                )
                continue

            # Clear a stale OT Edit Date (not in this row's attendance or outside the range)
            self._clear_stale_edit_date(item, details)

            # 1) Push row-level edits to the row's OT Edit Date
            self._push_row_values_to_details(item, details)

            # 2) Rebuild row totals from details
            item.normal_ot_hours = round(sum(flt(d.get("normal_ot_hours")) for d in details), 2)
            item.holiday_ot_hours = round(sum(flt(d.get("holiday_ot_hours")) for d in details), 2)
            item.special_ot_hours = round(sum(flt(d.get("special_ot_hours")) for d in details), 2)
            item.total_ot_hours = (
                item.normal_ot_hours + item.holiday_ot_hours + item.special_ot_hours
            )
            item.attendance_details = json.dumps(details)

    def _clear_stale_edit_date(self, item, details):
        if not item.get("ot_edit_date"):
            return

        edit_date = getdate(item.ot_edit_date)
        in_range = getdate(self.from_date) <= edit_date <= getdate(self.to_date)
        has_attendance = str(edit_date) in {str(d.get("attendance_date")) for d in details}

        if not (in_range and has_attendance):
            item.ot_edit_date = None

    def _push_row_values_to_details(self, item, details):
        """If a row value differs from the sum of its details (i.e. edited at row level),
        add/subtract the difference (delta) on this row's OT Edit Date only."""

        for field in ("normal_ot_hours", "holiday_ot_hours", "special_ot_hours"):
            row_value = max(flt(item.get(field)), 0)
            details_sum = sum(flt(d.get(field)) for d in details)
            delta = round(row_value - details_sum, 2)

            if abs(delta) <= 0.01:
                continue

            name = item.employee_name or item.employee

            if not item.get("ot_edit_date"):
                frappe.throw(
                    _("Row {0} ({1}): Please select an OT Edit Date before changing OT hours.").format(item.idx, name)
                )

            edit_date = str(getdate(item.ot_edit_date))
            target = next(
                (d for d in details if str(d.get("attendance_date")) == edit_date), None
            )
            if not target:
                frappe.throw(
                    _("Row {0} ({1}): No attendance record found on OT Edit Date {2}.").format(
                        item.idx, name, edit_date
                    )
                )

            new_value = round(flt(target.get(field)) + delta, 2)
            if new_value < 0:
                frappe.throw(
                    _("Row {0} ({1}): {2} on {3} would become negative.").format(
                        item.idx, name, field, edit_date
                    )
                )

            target[field] = new_value

    def on_submit(self):
        if self.status != "Approved":
            frappe.throw(_("Only approved requests can be submitted."))
        self.update_attendance_records()

    def on_cancel(self):
        self.clear_attendance_overtime()

    def _get_details(self, item):
        """Safely parse the row's JSON details"""
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
        frappe.msgprint(_("Overtime hours updated in {0} attendance records.").format(count))

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
            frappe.throw(_("Auto Calculate Overtime is disabled in Overtime Settings."))

        if not self.custom_company:
            frappe.throw(_("Please select a Company first."))

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

        # ---- Group by employee ----
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

            # Fetch project(s)
            projects = frappe.db.sql("""
                SELECT DISTINCT custom_project
                FROM `tabEmployee Checkin`
                WHERE attendance = %s AND custom_project IS NOT NULL AND custom_project != ''
            """, record.attendance, as_dict=True)
            project_list = ", ".join([p.custom_project for p in projects if p.custom_project])

            has_overtime = normal_ot_hours > 0 or holiday_ot_hours > 0 or special_ot_hours > 0
            if not has_overtime:
                continue

            # Detail entry (used by the popup)
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

        # ---- Append grouped rows ----
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
            frappe.msgprint(_("No overtime records found for company {0}.").format(self.custom_company))
        else:
            frappe.msgprint(_("Fetched {0} employee(s) with overtime.").format(len(self.overtime_details)))

        return self.overtime_details