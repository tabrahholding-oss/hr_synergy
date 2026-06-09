import frappe

def validate_intercompany_transfer(doc, method):
    if doc.purpose != "Intercompany Issue":
        return

    if doc.custom_source_company == doc.custom_target_company:
        frappe.throw("Source Company and Target Company cannot be same")