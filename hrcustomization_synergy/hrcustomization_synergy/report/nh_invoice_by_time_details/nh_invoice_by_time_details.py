import frappe
from frappe import _


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{
			"label": _("Sales Invoice"),
			"fieldname": "sales_invoice",
			"fieldtype": "Link",
			"options": "Sales Invoice",
			"width": 120,
		},
		{
			"label": _("Company"),
			"fieldname": "company",
			"fieldtype": "Link",
			"options": "Company",
			"width": 140,
		},
		{
			"label": _("Customer"),
			"fieldname": "customer",
			"fieldtype": "Link",
			"options": "Customer",
			"width": 140,
		},
		{
			"label": _("Posting Date"),
			"fieldname": "posting_date",
			"fieldtype": "Date",
			"width": 100,
		},
		{"label": _("Posting Time"), "fieldname": "posting_time", "fieldtype": "Time", "width": 90},
		{"label": _("Meal Type"), "fieldname": "meal_type", "fieldtype": "Data", "width": 100},
		{"label": _("Order Type"), "fieldname": "order_type", "fieldtype": "Data", "width": 120},
		{
			"label": _("Payment Method"),
			"fieldname": "payment_method",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"label": _("Item Code"),
			"fieldname": "item_code",
			"fieldtype": "Link",
			"options": "Item",
			"width": 120,
		},
		{"label": _("Item Name"), "fieldname": "item_name", "fieldtype": "Data", "width": 200},
		{
			"label": _("Item Group"),
			"fieldname": "item_group",
			"fieldtype": "Link",
			"options": "Item Group",
			"width": 150,
		},
		{"label": _("Qty"), "fieldname": "qty", "fieldtype": "Float", "width": 80},
		{"label": _("Rate"), "fieldname": "rate", "fieldtype": "Currency", "width": 100},
		{
			"label": _("Sales Amount"),
			"fieldname": "sales_amount",
			"fieldtype": "Currency",
			"width": 120,
		},
		{
			"label": _("Cost of Sale"),
			"fieldname": "cost_of_sale",
			"fieldtype": "Currency",
			"width": 120,
		},
		{
			"label": _("Gross Profit"),
			"fieldname": "gross_profit",
			"fieldtype": "Currency",
			"width": 120,
		},
		{
			"label": _("Gross Profit %"),
			"fieldname": "gross_profit_percent",
			"fieldtype": "Percent",
			"width": 110,
		},
		{
			"label": _("Invoice Total"),
			"fieldname": "invoice_total",
			"fieldtype": "Currency",
			"width": 120,
		},
	]


def get_data(filters):
	conditions = ""

	if filters.get("company"):
		conditions += " AND si.company = %(company)s"
	if filters.get("customer"):
		conditions += " AND si.customer = %(customer)s"
	if filters.get("from_date") and filters.get("to_date"):
		conditions += " AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s"

	query = f"""
        SELECT
            si.name AS sales_invoice,
            si.company AS company,
            si.customer AS customer,
            si.posting_date AS posting_date,
            si.posting_time AS posting_time,
            CASE
                WHEN si.posting_time < '12:00:00' THEN 'Breakfast'
                WHEN si.posting_time < '18:00:00' THEN 'Lunch'
                ELSE 'Dinner'
            END AS meal_type,
            si.resturent_type AS order_type,
            COALESCE(
                (
                    SELECT GROUP_CONCAT(DISTINCT sip.mode_of_payment ORDER BY sip.mode_of_payment SEPARATOR ', ')
                    FROM `tabSales Invoice Payment` sip
                    WHERE sip.parent = si.name
                ),
                (
                    SELECT GROUP_CONCAT(DISTINCT pe.mode_of_payment ORDER BY pe.mode_of_payment SEPARATOR ', ')
                    FROM `tabPayment Entry Reference` per
                    INNER JOIN `tabPayment Entry` pe ON pe.name = per.parent
                    WHERE per.reference_doctype = 'Sales Invoice'
                      AND per.reference_name = si.name
                      AND pe.docstatus = 1
                ),
                'Not Paid'
            ) AS payment_method,
            sii.item_code AS item_code,
            sii.item_name AS item_name,
            i.item_group AS item_group,
            sii.qty AS qty,
            sii.rate AS rate,
            sii.amount AS sales_amount,
            COALESCE(slec.cost_of_sale, 0) AS cost_of_sale,
            (sii.amount - COALESCE(slec.cost_of_sale, 0)) AS gross_profit,
            CASE
                WHEN sii.amount = 0 THEN 0
                ELSE ((sii.amount - COALESCE(slec.cost_of_sale, 0)) / sii.amount) * 100
            END AS gross_profit_percent,
            si.grand_total AS invoice_total
        FROM `tabSales Invoice` si
        INNER JOIN `tabSales Invoice Item` sii 
            ON sii.parent = si.name AND sii.parenttype = 'Sales Invoice'
        LEFT JOIN `tabItem` i 
            ON i.name = sii.item_code
        LEFT JOIN (
            SELECT
                sle.voucher_no,
                sle.voucher_detail_no,
                ABS(SUM(sle.stock_value_difference)) AS cost_of_sale
            FROM `tabStock Ledger Entry` sle
            WHERE sle.voucher_type = 'Sales Invoice'
            GROUP BY sle.voucher_no, sle.voucher_detail_no
        ) slec 
            ON slec.voucher_no = si.name AND slec.voucher_detail_no = sii.name
        WHERE
            si.docstatus = 1
            {conditions}
        ORDER BY
            si.posting_date DESC,
            si.posting_time DESC,
            si.name,
            sii.idx;
    """

	return frappe.db.sql(query, filters, as_dict=1)