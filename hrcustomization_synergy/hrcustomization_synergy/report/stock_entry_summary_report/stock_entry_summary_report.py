import frappe
from frappe import _

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data

def get_columns():
    return [
        {"label": _("Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 110},
        {"label": _("Ref Number"), "fieldname": "name", "fieldtype": "Link", "options": "Stock Entry", "width": 140},
        {"label": _("Doc Status"), "fieldname": "docstatus", "fieldtype": "Select", "width": 100},
        {"label": _("Source WH"), "fieldname": "from_warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 130},
        {"label": _("Target WH"), "fieldname": "to_warehouse", "fieldtype": "Link", "options": "Warehouse", "width": 130},
        {"label": _("Total Cost"), "fieldname": "total_incoming_value", "fieldtype": "Currency", "width": 120},
        {"label": _("Total S.P"), "fieldname": "total_sp", "fieldtype": "Currency", "width": 130},
        {"label": _("Stock Entry Type"), "fieldname": "stock_entry_type", "fieldtype": "Data", "width": 150}
    ]

def get_data(filters):
    entries = frappe.db.get_all(
        "Stock Entry",
        fields=["name", "posting_date", "docstatus", "from_warehouse", "to_warehouse", "total_incoming_value", "stock_entry_type"]
    )
    
    data = []
    
    for entry in entries:
        status_map = {0: "Draft", 1: "Submitted", 2: "Cancelled"}
        doc_status = status_map.get(entry.docstatus, "Unknown")
        
        items = frappe.db.get_all(
            "Stock Entry Detail",
            filters={"parent": entry.name},
            fields=["item_code", "uom", "stock_uom", "conversion_factor", "qty"]
        )
        
        total_entry_sp = 0 
        
        for row in items:
            unit_price = 0
            
            price = frappe.db.get_value(
                "Item Price", 
                {"item_code": row.item_code, "price_list": "Standard Selling", "uom": row.uom}, 
                "price_list_rate"
            )
            
            if price:
                unit_price = price
            else:
                stock_price = frappe.db.get_value(
                    "Item Price", 
                    {"item_code": row.item_code, "price_list": "Standard Selling", "uom": row.stock_uom}, 
                    "price_list_rate"
                )
                if stock_price:
                    unit_price = stock_price * (row.conversion_factor or 1)
                else:
                    unit_price = 0
            
            row_total = unit_price * row.qty
            total_entry_sp += row_total
            
        data.append({
            "posting_date": entry.posting_date,
            "name": entry.name,
            "docstatus": doc_status,
            "from_warehouse": entry.from_warehouse,
            "to_warehouse": entry.to_warehouse,
            "total_incoming_value": entry.total_incoming_value,
            "total_sp": total_entry_sp, 
            "stock_entry_type": entry.stock_entry_type
        })
        
    return data