import frappe
from frappe.utils import now_datetime, get_time

def send_scheduled_reports():
    doc = frappe.get_single("Email Report Scheduler")

    if not doc.enabled or not doc.auto_email_report:
        return

    # System/User Timezone ke mutabiq current time len
    now = now_datetime()
    current_time = now.time()
    today = now.strftime("%Y-%m-%d")

    already_sent = [s.strip() for s in (doc.last_sent or "").split(",") if s.strip()]
    already_sent = [s for s in already_sent if s.startswith(today)]

    no_of_times = int(doc.no_of_times or 0)
    has_changed = False

    for i in range(1, no_of_times + 1):
        time_val = doc.get(f"time_{i}")
        if not time_val:
            continue

        slot_time = get_time(time_val)
        # slot_key ab actual time value pe based hai, index pe nahi -
        # isliye time change karne se naya slot ban jata hai, purana "sent"
        # status usay block nahi karta
        slot_key = f"{today}_{slot_time.strftime('%H:%M')}"

        if current_time >= slot_time and slot_key not in already_sent:
            report_doc = frappe.get_doc("Auto Email Report", doc.auto_email_report)

            if doc.recipients:
                emails = [e.strip() for e in doc.recipients.replace(",", "\n").split("\n") if e.strip()]
                report_doc.email_to = "\n".join(emails)

            try:
                report_doc.send()
                already_sent.append(slot_key)
                has_changed = True
            except Exception:
                frappe.log_error(title="Email Report Scheduler Error", message=frappe.get_traceback())

    if has_changed:
        doc.last_sent = ",".join(already_sent)
        doc.flags.ignore_permissions = True
        doc.save()

    frappe.db.commit()