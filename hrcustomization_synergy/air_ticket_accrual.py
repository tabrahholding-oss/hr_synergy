import frappe
from frappe.utils import nowdate, add_months, getdate, date_diff

def accrue_air_tickets():
    today = getdate(nowdate())
    employees = frappe.get_all("Employee", 
        filters={"status": "Active"}, 
        fields=["name", "custom_frequency_in_months", "custom_no_of_dependents", "date_of_joining", "custom_amount"]
    )

    for emp in employees:
        if not emp.get("custom_frequency_in_months") or emp.custom_frequency_in_months <= 0:
            continue

        date_of_joining = getdate(emp.date_of_joining) if emp.date_of_joining else None
        if not date_of_joining:
            continue  # Skip employees without a joining date

        total_tickets = (emp.get("custom_no_of_dependents") or 0) + 1

        # Calculate the number of full months since joining
        months_diff = (today.year - date_of_joining.year) * 12 + (today.month - date_of_joining.month)
        if today.day < date_of_joining.day:
            months_diff -= 1
        if months_diff < 0:
            months_diff = 0

        # Loop through each month up to the current month
        for month in range(months_diff + 1):
            accrual_date = add_months(date_of_joining, month)
            next_month_date = add_months(date_of_joining, month + 1)

            # Determine if the period is in the past, current, or future
            if next_month_date <= today:
                # Full period in the past
                prorated_accrual = total_tickets / emp.custom_frequency_in_months
            elif accrual_date <= today < next_month_date:
                # Current period, prorate based on days worked
                days_worked = date_diff(today, accrual_date) + 1  # Inclusive of start date
                days_in_period = date_diff(next_month_date, accrual_date)
                if days_in_period <= 0:
                    continue
                prorated_accrual = (total_tickets / emp.custom_frequency_in_months) * (days_worked / days_in_period)
            else:
                # Future period, skip
                continue

            # Calculate the amount for the ledger entry
            custom_amount = emp.get("custom_amount") or 0
            amount = custom_amount * prorated_accrual

            # Check if the entry already exists to avoid duplicates
            existing_entry = frappe.db.exists(
                "Air Ticket Ledger Entry",
                {
                    "employee": emp.name,
                    "from_date": accrual_date,
                    "to_date": next_month_date,
                }
            )
            if not existing_entry:
                ledger_entry = frappe.get_doc({
                    "doctype": "Air Ticket Ledger Entry",
                    "employee": emp.name,
                    "from_date": accrual_date,
                    "to_date": next_month_date,
                    "no_of_ticket": prorated_accrual,
                    "amount": amount,
                })
                ledger_entry.insert(ignore_permissions=True)
                ledger_entry.submit()

    frappe.db.commit()