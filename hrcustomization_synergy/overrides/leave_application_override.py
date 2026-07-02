import calendar
from datetime import date

import frappe
from frappe import _
from frappe.utils import flt, cint, getdate
from frappe.utils.safe_exec import get_safe_globals

from hrms.hr.doctype.leave_application.leave_application import (
    LeaveApplication,
    get_number_of_leave_days,
)

LEAVE_SALARY_COMPONENT = "Leave Salary"
LEAVE_SALARY_FORMULA_FIELD = "custom_leave_salary_formula"

class LeaveApplicationOverride(LeaveApplication):
    def validate(self):
        self.calculate_forecasted_leave()
        super().validate()

    def calculate_forecasted_leave(self):
        if self.leave_type != "Annual Leave" or not self.from_date or not self.employee:
            self.custom_forcasted_leave = 0
            return

        leave_balance = self.get_forecasted_leave_balance()

        emp = frappe.db.get_value(
            "Employee", self.employee,
            ["date_of_joining"],
            as_dict=True
        )

        if not emp or not emp.date_of_joining:
            self.custom_forcasted_leave = flt(leave_balance, 2)
            return

        from datetime import date
        today = date.today()
        joining = getdate(emp.date_of_joining)

        years = today.year - joining.year
        if (today.month, today.day) < (joining.month, joining.day):
            years -= 1

        yearly_leave = 30 if years > 5 else 21

        first_day = today.replace(day=1)
        from_date = getdate(self.from_date)

        diff_days = (from_date - first_day).days
        if diff_days < 0:
            diff_days = 0

        forecasting_days = (yearly_leave / 365) * diff_days
        self.custom_forcasted_leave = flt(leave_balance + forecasting_days, 2)

    def get_forecasted_leave_balance(self):
        allocations = frappe.get_list(
            "Leave Allocation",
            filters={
                "employee": self.employee,
                "leave_type": self.leave_type,
                "docstatus": 1,
                "from_date": ["<=", self.from_date],
                "to_date": [">=", self.from_date]
            },
            fields=["name", "from_date"],
            order_by="from_date desc",
            limit=1
        )

        if not allocations:
            return 0

        allocation = allocations[0]

        ledger_entries = frappe.get_list(
            "Leave Ledger Entry",
            filters={
                "employee": self.employee,
                "leave_type": self.leave_type,
                "docstatus": 1,
                "is_expired": 0,
                "is_lwp": 0,
                "from_date": ["<=", self.from_date],
                "to_date": [">=", allocation.from_date],
                "transaction_type": ["in", [
                    "Leave Allocation",
                    "Leave Application",
                    "Leave Adjustment"
                ]]
            },
            fields=["leaves", "transaction_type"]
        )

        balance = 0
        for row in ledger_entries:
            balance += flt(row.leaves)

        return balance
    def validate_balance_leaves(self):
        """
        Override HRMS default leave balance validation.
        Validates against custom field: custom_forcasted_leave.
        """

        if self.from_date and self.to_date:
            self.total_leave_days = get_number_of_leave_days(
                self.employee,
                self.leave_type,
                self.from_date,
                self.to_date,
                self.half_day,
                self.half_day_date,
            )

            if self.total_leave_days <= 0:
                frappe.throw(
                    _(
                        "The day(s) on which you are applying for leave are holidays. "
                        "You need not apply for leave."
                    ),
                    title=_("Invalid Leave Application"),
                )

            is_lwp = frappe.db.get_value("Leave Type", self.leave_type, "is_lwp")
            if cint(is_lwp):
                return

            # Only validate forecasted leave for Annual Leave
            if self.leave_type != "Annual Leave":
                return

            custom_forcasted_leave = flt(self.get("custom_forcasted_leave"))
            total_leave_days = flt(self.total_leave_days)

            if self.status != "Rejected" and (
                (total_leave_days - custom_forcasted_leave) > 0.01
                or not custom_forcasted_leave
            ):
                frappe.throw(
                    _(
                        "Insufficient forecasted leave for Leave Type {0}. "
                        "You are applying for {1} day(s), but Forecasted Leave is only {2} day(s)."
                    ).format(
                        frappe.bold(self.leave_type),
                        frappe.bold(total_leave_days),
                        frappe.bold(custom_forcasted_leave),
                    ),
                    title=_("Insufficient Forecasted Leave"),
                )

    def on_submit(self):
        super().on_submit()
        self.create_leave_salary_additional_salaries()

    def on_cancel(self):
        self.cancel_leave_salary_additional_salaries()
        super().on_cancel()

    def create_leave_salary_additional_salaries(self):
        if not self.employee or not self.leave_type or not self.from_date or not self.to_date:
            return

        if self.status == "Rejected":
            return

        # Sirf Annual Leave k liye hi Additional Salary create hogi.
        # Kisi bhi doosre leave type k liye ye logic skip ho jayega.
        if self.leave_type != "Annual Leave":
            return

        is_lwp = frappe.db.get_value("Leave Type", self.leave_type, "is_lwp")
        if cint(is_lwp):
            return

        self.validate_leave_salary_component()
        periods = self.get_month_wise_leave_periods()

        for period in periods:
            leave_days = flt(period["leave_days"])
            if leave_days <= 0:
                continue

            payroll_date = period["payroll_date"]
            salary_structure_assignment = self.get_salary_structure_assignment(payroll_date)
            one_day_leave_salary = self.get_one_day_leave_salary(salary_structure_assignment)
            leave_salary_amount = flt(one_day_leave_salary * leave_days, 2)

            if leave_salary_amount <= 0:
                frappe.throw(
                    _(
                        "Leave Salary amount cannot be zero. Please check Leave Salary Formula "
                        "in Salary Structure."
                    ),
                    title=_("Invalid Leave Salary Amount"),
                )

            self.create_or_update_monthly_additional_salary(
                period=period,
                amount=leave_salary_amount,
                one_day_leave_salary=one_day_leave_salary,
            )

    def get_month_wise_leave_periods(self):
        from_date = getdate(self.from_date)
        to_date = getdate(self.to_date)
        periods = []
        current_month_start = date(from_date.year, from_date.month, 1)

        while current_month_start <= to_date:
            month_last_day = calendar.monthrange(
                current_month_start.year,
                current_month_start.month,
            )[1]

            current_month_end = date(
                current_month_start.year,
                current_month_start.month,
                month_last_day,
            )

            period_start = max(from_date, current_month_start)
            period_end = min(to_date, current_month_end)

            half_day = 0
            half_day_date = None

            if cint(self.half_day) and self.half_day_date:
                application_half_day_date = getdate(self.half_day_date)
                if period_start <= application_half_day_date <= period_end:
                    half_day = 1
                    half_day_date = application_half_day_date

            leave_days = get_number_of_leave_days(
                self.employee,
                self.leave_type,
                period_start,
                period_end,
                half_day,
                half_day_date,
            )

            if flt(leave_days) > 0:
                periods.append(
                    {
                        "period_start": period_start,
                        "period_end": period_end,
                        "month_start": current_month_start,
                        "month_end": current_month_end,
                        "payroll_date": period_start,
                        "leave_days": flt(leave_days),
                    }
                )

            current_month_start = self.add_one_month(current_month_start)

        return periods

    def create_or_update_monthly_additional_salary(self, period, amount, one_day_leave_salary):
        existing_additional_salary = self.get_existing_monthly_additional_salary(
            period["month_start"],
            period["month_end"],
        )

        if existing_additional_salary:
            additional_salary = frappe.get_doc("Additional Salary", existing_additional_salary.name)

            if additional_salary.docstatus == 1:
                if flt(additional_salary.amount, 2) != flt(amount, 2):
                    frappe.throw(
                        _(
                            "A submitted Leave Salary Additional Salary already exists "
                            "for this Leave Application in this payroll month: {0}. "
                            "Please cancel it first."
                        ).format(frappe.bold(additional_salary.name)),
                        title=_("Additional Salary Already Exists"),
                    )
                return

            additional_salary.amount = amount
            additional_salary.payroll_date = period["payroll_date"]
            additional_salary.flags.ignore_permissions = True
            additional_salary.save()
            additional_salary.submit()
            return

        additional_salary = frappe.new_doc("Additional Salary")
        additional_salary.employee = self.employee
        additional_salary.salary_component = LEAVE_SALARY_COMPONENT
        additional_salary.amount = amount
        additional_salary.payroll_date = period["payroll_date"]
        additional_salary.company = self.get_company()

        if additional_salary.meta.has_field("overwrite_salary_structure_amount"):
            additional_salary.overwrite_salary_structure_amount = 0

        if additional_salary.meta.has_field("type"):
            additional_salary.type = "Deduction"

        if additional_salary.meta.has_field("ref_doctype"):
            additional_salary.ref_doctype = "Leave Application"

        if additional_salary.meta.has_field("ref_docname"):
            additional_salary.ref_docname = self.name

        if additional_salary.meta.has_field("remarks"):
            additional_salary.remarks = (
                f"Leave Salary created from Leave Application: {self.name}. "
                f"Leave Type: {self.leave_type}. "
                f"Period: {period['period_start']} to {period['period_end']}. "
                f"Payroll Date: {period['payroll_date']}. "
                f"Leave Days: {period['leave_days']}. "
                f"One Day Leave Salary: {one_day_leave_salary}. "
                f"Amount: {amount}."
            )

        additional_salary.flags.ignore_permissions = True
        additional_salary.insert()
        additional_salary.submit()

    def cancel_leave_salary_additional_salaries(self):
        additional_salaries = self.get_existing_leave_salary_additional_salaries()
        for row in additional_salaries:
            additional_salary = frappe.get_doc("Additional Salary", row.name)
            additional_salary.flags.ignore_permissions = True
            if additional_salary.docstatus == 1:
                additional_salary.cancel()
            elif additional_salary.docstatus == 0:
                additional_salary.delete()

    def get_existing_monthly_additional_salary(self, month_start, month_end):
        meta = frappe.get_meta("Additional Salary")
        filters = [
            ["Additional Salary", "employee", "=", self.employee],
            ["Additional Salary", "salary_component", "=", LEAVE_SALARY_COMPONENT],
            ["Additional Salary", "docstatus", "!=", 2],
            ["Additional Salary", "payroll_date", "between", [month_start, month_end]],
        ]

        if meta.has_field("ref_doctype") and meta.has_field("ref_docname"):
            filters.extend([
                ["Additional Salary", "ref_doctype", "=", "Leave Application"],
                ["Additional Salary", "ref_docname", "=", self.name],
            ])
        else:
            filters.append([
                "Additional Salary", "remarks", "like", f"%Leave Application: {self.name}%"
            ])

        result = frappe.get_all(
            "Additional Salary",
            filters=filters,
            fields=["name", "docstatus", "amount", "payroll_date"],
            limit=1,
        )
        return result[0] if result else None

    def get_existing_leave_salary_additional_salaries(self):
        meta = frappe.get_meta("Additional Salary")
        filters = [
            ["Additional Salary", "employee", "=", self.employee],
            ["Additional Salary", "salary_component", "=", LEAVE_SALARY_COMPONENT],
            ["Additional Salary", "docstatus", "!=", 2],
        ]

        if meta.has_field("ref_doctype") and meta.has_field("ref_docname"):
            filters.extend([
                ["Additional Salary", "ref_doctype", "=", "Leave Application"],
                ["Additional Salary", "ref_docname", "=", self.name],
            ])
        else:
            filters.append([
                "Additional Salary", "remarks", "like", f"%Leave Application: {self.name}%"
            ])

        return frappe.get_all(
            "Additional Salary",
            filters=filters,
            fields=["name", "docstatus", "amount", "payroll_date"],
            order_by="payroll_date asc",
        )

    def get_one_day_leave_salary(self, salary_structure_assignment):
        salary_structure = frappe.get_doc("Salary Structure", salary_structure_assignment.salary_structure)
        formula = salary_structure.get(LEAVE_SALARY_FORMULA_FIELD)

        if not formula:
            frappe.throw(
                _("Leave Salary Formula is missing in Salary Structure {0}.").format(
                    frappe.bold(salary_structure.name)
                ),
                title=_("Missing Leave Salary Formula"),
            )

        context = self.get_leave_salary_formula_context(salary_structure_assignment, salary_structure)

        try:
            one_day_leave_salary = frappe.safe_eval(
                code=formula,
                eval_globals=get_safe_globals(),
                eval_locals=context,
            )
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Leave Salary Formula Error")
            frappe.throw(
                _(
                    "Could not evaluate Leave Salary Formula in Salary Structure {0}. "
                    "Formula: {1}"
                ).format(frappe.bold(salary_structure.name), frappe.bold(formula)),
                title=_("Leave Salary Formula Error"),
            )

        return flt(one_day_leave_salary, 2)

    def get_leave_salary_formula_context(self, salary_structure_assignment, salary_structure):
        context = {}
        for row in salary_structure.get("earnings", []):
            if row.get("abbr"):
                context[row.abbr] = flt(row.amount)

        for row in salary_structure.get("deductions", []):
            if row.get("abbr"):
                context[row.abbr] = flt(row.amount)

        assignment_dict = salary_structure_assignment.as_dict()
        for key, value in assignment_dict.items():
            if isinstance(value, (int, float)):
                context[key] = flt(value)
            else:
                context[key] = value

        context.update({
            "employee": self.employee,
            "leave_type": self.leave_type,
            "from_date": self.from_date,
            "to_date": self.to_date,
            "total_leave_days": flt(self.total_leave_days),
            "flt": flt,
            "cint": cint,
        })
        return context

    def get_salary_structure_assignment(self, payroll_date):
        assignments = frappe.get_all(
            "Salary Structure Assignment",
            filters={
                "employee": self.employee,
                "docstatus": 1,
                "from_date": ["<=", payroll_date],
            },
            fields=["name"],
            order_by="from_date desc",
            limit=1,
        )

        if not assignments:
            frappe.throw(
                _(
                    "No active Salary Structure Assignment found for Employee {0} on date {1}."
                ).format(frappe.bold(self.employee), frappe.bold(payroll_date)),
                title=_("Salary Structure Assignment Missing"),
            )
        return frappe.get_doc("Salary Structure Assignment", assignments[0].name)

    def validate_leave_salary_component(self):
        if not frappe.db.exists("Salary Component", LEAVE_SALARY_COMPONENT):
            frappe.throw(
                _(
                    "Salary Component {0} does not exist. Please create it first as an Earning component."
                ).format(frappe.bold(LEAVE_SALARY_COMPONENT)),
                title=_("Missing Salary Component"),
            )

    def get_company(self):
        return self.get("company") or frappe.db.get_value("Employee", self.employee, "company")

    def add_one_month(self, current_date):
        if current_date.month == 12:
            return date(current_date.year + 1, 1, 1)
        return date(current_date.year, current_date.month + 1, 1)