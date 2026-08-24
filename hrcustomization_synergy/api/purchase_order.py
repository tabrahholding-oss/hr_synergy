import frappe
from frappe.utils import flt
from frappe.model.document import Document
from frappe.utils import getdate
from frappe.model.mapper import get_mapped_doc

@frappe.whitelist()
def get_previous_purchases(item_code, from_date=None, to_date=None):
    if not item_code:
        return []

    filters = {"item_code": item_code}

    # Optional: only submitted POs
    po_filters = {"docstatus": 1}  # add this if you want only submitted

    previous_items = frappe.get_all(
        "Purchase Order Item",
        filters=filters,
        fields=["parent", "rate", "qty", "uom"],
        order_by="creation desc",
    )

    purchases = []
    for item in previous_items:
        parent_doc = frappe.db.get_value(
            "Purchase Order",
            item.parent,
            [
                "supplier",
                "supplier_name",
                "docstatus",
                "transaction_date",
            ],  # ← important change
            as_dict=True,
        )
        if not parent_doc:
            continue

        # Date filter on transaction_date (PO date)
        if from_date and to_date and parent_doc.transaction_date:
            po_date = getdate(parent_doc.transaction_date)
            from_d = getdate(from_date)
            to_d = getdate(to_date)
            if not (from_d <= po_date <= to_d):
                continue

        purchases.append(
            {
                "doc_name": item.parent,
                "supplier_name": parent_doc.supplier_name or "N/A",
                "schedule_date": parent_doc.transaction_date
                if parent_doc.transaction_date
                else "N/A",  # update key name if needed
                "rate": item.rate,
                "qty": item.qty,
                "uom": item.uom,
                "status": (
                    "Submitted"
                    if parent_doc.docstatus == 1
                    else "Cancelled"
                    if parent_doc.docstatus == 2
                    else "Draft"
                ),
            }
        )

    return purchases