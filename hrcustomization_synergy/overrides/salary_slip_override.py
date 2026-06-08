import calendar

import frappe
from frappe.utils import flt, getdate, money_in_words


def apply_paid_leave_deduction(doc, method=None):
    paid_leave_days = flt(doc.get("qhr_paid_leave_days") or 0)

    # Important:
    # If there is no paid leave, do nothing.
    # ERPNext normal salary calculation will continue.
    if paid_leave_days <= 0:
        return

    if not doc.start_date:
        return

    # Take month from Salary Slip start_date
    start_date = getdate(doc.start_date)

    # Get actual calendar days of that month
    # Feb = 28/29, Mar = 31, Apr = 30, etc.
    salary_days = calendar.monthrange(start_date.year, start_date.month)[1]
    salary_days = flt(salary_days)

    if salary_days <= 0:
        return

    skip_components = [
        "Annual Leave Salary",
        "Leave Salary",
        "Paid Leave Salary",
    ]

    for row in doc.get("earnings") or []:
        if not row.get("salary_component"):
            continue

        if row.salary_component in skip_components:
            continue

        if row.get("statistical_component"):
            continue

        if row.get("do_not_include_in_total"):
            continue

        # Use ERPNext original/default amount where possible.
        # This prevents repeated deduction when saving again.
        original_amount = flt(row.get("default_amount") or 0)

        if original_amount <= 0:
            original_amount = flt(row.get("amount") or 0)

        if original_amount <= 0:
            continue

        deduction_amount = (original_amount / salary_days) * paid_leave_days
        new_amount = original_amount - deduction_amount

        if new_amount < 0:
            new_amount = 0

        row.amount = flt(new_amount, 2)

    recalculate_salary_slip_totals(doc)


def recalculate_salary_slip_totals(doc):
    gross_pay = 0
    total_deduction = 0

    for row in doc.get("earnings") or []:
        if row.get("statistical_component"):
            continue

        if row.get("do_not_include_in_total"):
            continue

        gross_pay += flt(row.get("amount") or 0)

    for row in doc.get("deductions") or []:
        if row.get("statistical_component"):
            continue

        if row.get("do_not_include_in_total"):
            continue

        total_deduction += flt(row.get("amount") or 0)

    doc.gross_pay = flt(gross_pay, 2)
    doc.total_deduction = flt(total_deduction, 2)
    doc.net_pay = flt(doc.gross_pay - doc.total_deduction, 2)
    doc.rounded_total = flt(doc.net_pay, 2)

    if doc.get("currency"):
        doc.total_in_words = money_in_words(doc.rounded_total, doc.currency)