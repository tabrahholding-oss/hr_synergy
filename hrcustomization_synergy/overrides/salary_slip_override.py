# import calendar

# import frappe
# from frappe.utils import flt, getdate, money_in_words


# def apply_paid_leave_deduction(doc, method=None):
#     # Populate attendance summary first
#     set_attendance_summary(doc)

#     paid_leave_days = flt(doc.get("custom_paid_leave_days") or 0)

#     # If there is no paid leave, do nothing.
#     if paid_leave_days <= 0:
#         recalculate_salary_slip_totals(doc)
#         return

#     if not doc.start_date:
#         return

#     start_date = getdate(doc.start_date)

#     # Actual calendar days of month
#     salary_days = calendar.monthrange(
#         start_date.year,
#         start_date.month
#     )[1]

#     salary_days = flt(salary_days)

#     if salary_days <= 0:
#         return

#     skip_components = [
#         "Annual Leave Salary",
#         "Leave Salary",
#         "Paid Leave Salary",
#     ]

#     for row in doc.get("earnings") or []:
#         if not row.get("salary_component"):
#             continue

#         if row.salary_component in skip_components:
#             continue

#         if row.get("statistical_component"):
#             continue

#         if row.get("do_not_include_in_total"):
#             continue

#         original_amount = flt(row.get("default_amount") or 0)

#         if original_amount <= 0:
#             original_amount = flt(row.get("amount") or 0)

#         if original_amount <= 0:
#             continue

#         deduction_amount = (
#             original_amount / salary_days
#         ) * paid_leave_days

#         new_amount = original_amount - deduction_amount

#         if new_amount < 0:
#             new_amount = 0

#         row.amount = flt(new_amount, 2)

#     recalculate_salary_slip_totals(doc)


# def set_attendance_summary(doc):
#     """
#     Populate:
#         custom_present_days
#         custom_paid_leave_days
#         custom_leave_without_pay_days
#         absent_days
#         payment_days
#     """

#     if not doc.employee or not doc.start_date or not doc.end_date:
#         return

#     attendances = frappe.get_all(
#         "Attendance",
#         filters={
#             "employee": doc.employee,
#             "attendance_date": [
#                 "between",
#                 [doc.start_date, doc.end_date]
#             ],
#             "docstatus": 1
#         },
#         fields=[
#             "status",
#             "leave_type",
#             "attendance_date"
#         ]
#     )

#     present_days = 0
#     absent_days = 0
#     paid_leave_days = 0
#     leave_without_pay_days = 0

#     leave_types = list(
#         {
#             d.leave_type
#             for d in attendances
#             if d.leave_type
#         }
#     )

#     leave_type_map = {}

#     if leave_types:
#         leave_type_details = frappe.get_all(
#             "Leave Type",
#             filters={
#                 "name": ["in", leave_types]
#             },
#             fields=["name", "is_lwp"]
#         )

#         leave_type_map = {
#             d.name: d.is_lwp
#             for d in leave_type_details
#         }

#     for att in attendances:
#         status = att.status
#         leave_type = att.leave_type

#         is_lwp = (
#             leave_type_map.get(leave_type, 0)
#             if leave_type
#             else 0
#         )

#         if status == "Present":
#             present_days += 1

#         elif status == "Work From Home":
#             present_days += 1

#         elif status == "Absent":
#             absent_days += 1

#         elif status == "On Leave":
#             if is_lwp:
#                 leave_without_pay_days += 1
#             else:
#                 paid_leave_days += 1

#         elif status == "Half Day":
#             present_days += 0.5

#             if leave_type:
#                 if is_lwp:
#                     leave_without_pay_days += 0.5
#                 else:
#                     paid_leave_days += 0.5
#             else:
#                 absent_days += 0.5

#     doc.custom_present_days = flt(present_days, 2)
#     doc.custom_paid_leave_days = flt(paid_leave_days, 2)
#     doc.custom_leave_without_pay_days = flt(
#         leave_without_pay_days,
#         2
#     )

#     # --- NEW: total days, absent_days, payment_days ---
#     total_days = flt(
#         (getdate(doc.end_date) - getdate(doc.start_date)).days + 1
#     )

#     doc.total_working_days = total_days

#     # Paid leave + LWP + actual absent — sab ko "absent" treat kiya
#     # ja raha hai payment_days kam karne ke liye, jaisa aapne bataya
#     total_absent = flt(
#         absent_days + paid_leave_days + leave_without_pay_days,
#         2
#     )

#     doc.absent_days = total_absent
#     doc.payment_days = flt(total_days - total_absent, 2)


# def recalculate_salary_slip_totals(doc):
#     gross_pay = 0
#     total_deduction = 0

#     for row in doc.get("earnings") or []:
#         if row.get("statistical_component"):
#             continue

#         if row.get("do_not_include_in_total"):
#             continue

#         gross_pay += flt(row.get("amount") or 0)

#     for row in doc.get("deductions") or []:
#         if row.get("statistical_component"):
#             continue

#         if row.get("do_not_include_in_total"):
#             continue

#         total_deduction += flt(row.get("amount") or 0)

#     doc.gross_pay = flt(gross_pay, 2)
#     doc.total_deduction = flt(total_deduction, 2)
#     doc.net_pay = flt(
#         doc.gross_pay - doc.total_deduction,
#         2
#     )
#     doc.rounded_total = flt(doc.net_pay, 2)

#     if doc.get("currency"):
#         doc.total_in_words = money_in_words(
#             doc.rounded_total,
#             doc.currency
#         )