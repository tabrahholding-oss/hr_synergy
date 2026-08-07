import frappe
from frappe import _
from frappe.utils import fmt_money


@frappe.whitelist()
def get_dashboard_data(filters):
	if isinstance(filters, str):
		filters = frappe.parse_json(filters)

	data = get_data(filters)
	return get_dashboard_payload(data)


def get_data(filters):
	conditions = ""
	if filters.get("company"):
		conditions += " AND si.company = %(company)s"
	if filters.get("from_date") and filters.get("to_date"):
		conditions += " AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s"
	if filters.get("item_group"):
		conditions += " AND i.item_group = %(item_group)s"
	if filters.get("order_type"):
		conditions += " AND si.resturent_type = %(order_type)s"
	if filters.get("meal_type"):
		if filters.get("meal_type") == "Breakfast":
			conditions += " AND si.posting_time < '12:00:00'"
		elif filters.get("meal_type") == "Lunch":
			conditions += (
				" AND si.posting_time >= '12:00:00' AND si.posting_time < '18:00:00'"
			)
		elif filters.get("meal_type") == "Dinner":
			conditions += " AND si.posting_time >= '18:00:00'"

	query = f"""
        SELECT
            si.name AS sales_invoice, si.company, si.customer, si.posting_date, si.posting_time,
            CASE
                WHEN si.posting_time < '12:00:00' THEN 'Breakfast'
                WHEN si.posting_time < '18:00:00' THEN 'Lunch'
                ELSE 'Dinner'
            END AS meal_type,
            si.resturent_type AS order_type,
            sii.item_code, sii.item_name, i.item_group, sii.qty, sii.rate, sii.amount AS sales_amount,
            COALESCE(slec.cost_of_sale, 0) AS cost_of_sale,
            (sii.amount - COALESCE(slec.cost_of_sale, 0)) AS gross_profit
        FROM `tabSales Invoice` si
        INNER JOIN `tabSales Invoice Item` sii ON sii.parent = si.name AND sii.parenttype = 'Sales Invoice'
        LEFT JOIN `tabItem` i ON i.name = sii.item_code
        LEFT JOIN (
            SELECT voucher_no, voucher_detail_no, ABS(SUM(stock_value_difference)) AS cost_of_sale
            FROM `tabStock Ledger Entry` WHERE voucher_type = 'Sales Invoice'
            GROUP BY voucher_no, voucher_detail_no
        ) slec ON slec.voucher_no = si.name AND slec.voucher_detail_no = sii.name
        WHERE si.docstatus = 1 {conditions}
    """
	return frappe.db.sql(query, filters, as_dict=1)


def get_dashboard_payload(data):
	total_sales = sum([row.get("sales_amount", 0) for row in data])
	total_cost = sum([row.get("cost_of_sale", 0) for row in data])
	gross_profit = total_sales - total_cost
	gp_percent = (gross_profit / total_sales * 100) if total_sales else 0
	total_invoices = len(
		set([row.get("sales_invoice") for row in data if row.get("sales_invoice")])
	)

	item_groups = {}
	meal_types = {"Breakfast": 0, "Lunch": 0, "Dinner": 0}

	for row in data:
		ig = row.get("item_group") or "Unassigned"
		if ig not in item_groups:
			item_groups[ig] = {"sales": 0, "cost": 0, "profit": 0}
		item_groups[ig]["sales"] += row.get("sales_amount", 0)
		item_groups[ig]["cost"] += row.get("cost_of_sale", 0)
		item_groups[ig]["profit"] += row.get("gross_profit", 0)

		m_type = row.get("meal_type")
		if m_type in meal_types:
			meal_types[m_type] += row.get("sales_amount", 0)

	# Chart Data Collections
	chart_item_group = {
		"labels": list(item_groups.keys()),
		"datasets": [
			{
				"name": "Sales",
				"values": [round(v["sales"], 2) for v in item_groups.values()],
			},
			{
				"name": "Profit",
				"values": [round(v["profit"], 2) for v in item_groups.values()],
			},
		],
	}

	chart_meal_type = {
		"labels": list(meal_types.keys()),
		"datasets": [
			{
				"name": "Amount",
				"values": [round(val, 2) for val in meal_types.values()],
			}
		],
	}

	ig_rows_html = "".join([
		f"<tr><td style='padding:8px; border-bottom:1px solid #e2e8f0;'>{ig}</td>"
		f"<td style='padding:8px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(v['sales'])}</td>"
		f"<td style='padding:8px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(v['cost'])}</td>"
		f"<td style='padding:8px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(v['profit'])}</td>"
		f"<td style='padding:8px; text-align:right; border-bottom:1px solid #e2e8f0;'>{(v['profit']/v['sales']*100 if v['sales'] else 0):.2f}%</td></tr>"
		for ig, v in item_groups.items()
	])

	meal_rows_html = "".join([
		f"<tr><td style='padding:8px; border-bottom:1px solid #e2e8f0;'><strong>{m}</strong></td>"
		f"<td style='padding:8px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(val)}</td></tr>"
		for m, val in meal_types.items()
	])

	detail_rows_html = "".join([
		f"<tr><td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.sales_invoice}</td>"
		f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{str(row.posting_date)}</td>"
		f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.meal_type}</td>"
		f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.order_type or ''}</td>"
		f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.item_code}</td>"
		f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.item_group or ''}</td>"
		f"<td style='padding:6px; text-align:right; border-bottom:1px solid #e2e8f0;'>{row.qty}</td>"
		f"<td style='padding:6px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(row.sales_amount)}</td>"
		f"<td style='padding:6px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(row.cost_of_sale)}</td></tr>"
		for row in data[:50]
	])

	html = f"""
	<div style="padding: 10px; font-family: sans-serif; background: #f8fafc;">
		<!-- Overall Summary Cards -->
		<div style="text-align:center; font-weight:bold; margin-bottom:15px; font-size:16px;">OVERALL SUMMARY</div>
		<div style="display: flex; gap: 15px; margin-bottom: 20px;">
			<div style="flex:1; background:#fff; padding:15px; text-align:center; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
				<div style="font-size:12px; color:#64748b;">SALES</div><div style="font-size:18px; font-weight:bold; color:#1e293b;">{fmt_money(total_sales)}</div>
			</div>
			<div style="flex:1; background:#fff; padding:15px; text-align:center; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
				<div style="font-size:12px; color:#64748b;">COST OF SALE</div><div style="font-size:18px; font-weight:bold; color:#1e293b;">{fmt_money(total_cost)}</div>
			</div>
			<div style="flex:1; background:#fff; padding:15px; text-align:center; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
				<div style="font-size:12px; color:#64748b;">GROSS PROFIT</div><div style="font-size:18px; font-weight:bold; color:#22c55e;">{fmt_money(gross_profit)}</div>
			</div>
			<div style="flex:1; background:#fff; padding:15px; text-align:center; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
				<div style="font-size:12px; color:#64748b;">GROSS PROFIT %</div><div style="font-size:18px; font-weight:bold; color:#1e293b;">{gp_percent:.2f}%</div>
			</div>
		</div>
		<div style="text-align:center; font-weight:bold; margin-bottom:20px; font-size:15px; color:#475569;">{total_invoices} INVOICES</div>

		<!-- Charts Section -->
		<div style="display: flex; gap: 20px; margin-bottom: 25px;">
			<div style="flex: 2; background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
				<div id="chart-item-group"></div>
			</div>
			<div style="flex: 1; background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
				<div id="chart-meal-type"></div>
			</div>
		</div>

		<!-- Breakdown Tables -->
		<div style="display: flex; gap: 20px; margin-bottom: 25px;">
			<div style="flex: 2; background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
				<h5 style="margin-top:0; color: #1e293b; text-align:center;">SALES BY ITEM GROUP</h5>
				<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
					<thead>
						<tr style="background: #f8fafc;">
							<th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align:left;">Item Group</th>
							<th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Sales</th>
							<th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Cost</th>
							<th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Gross Profit</th>
							<th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">GP %</th>
						</tr>
					</thead>
					<tbody>{ig_rows_html}</tbody>
				</table>
			</div>
			<div style="flex: 1; background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
				<h5 style="margin-top:0; color: #1e293b; text-align:center;">SALES BY MEAL TYPE</h5>
				<table style="width: 100%; border-collapse: collapse; font-size: 13px;">
					<thead>
						<tr style="background: #f8fafc;">
							<th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align:left;">Meal Type</th>
							<th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Amount</th>
						</tr>
					</thead>
					<tbody>{meal_rows_html}</tbody>
				</table>
			</div>
		</div>

		<!-- Detail Data -->
		<div style="background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
			<h5 style="margin-top:0; color: #1e293b; text-align:center;">DETAIL DATA (Top 50 Rows)</h5>
			<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
				<thead>
					<tr style="background: #f8fafc; text-align:left;">
						<th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Invoice</th>
						<th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Date</th>
						<th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Meal</th>
						<th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Order Type</th>
						<th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Item</th>
						<th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Group</th>
						<th style="padding: 6px; border-bottom: 2px solid #cbd5e1; text-align:right;">Qty</th>
						<th style="padding: 6px; border-bottom: 2px solid #cbd5e1; text-align:right;">Sales</th>
						<th style="padding: 6px; border-bottom: 2px solid #cbd5e1; text-align:right;">Cost</th>
					</tr>
				</thead>
				<tbody>{detail_rows_html}</tbody>
			</table>
		</div>
	</div>
	"""

	return {
		"html": html,
		"chart_item_group": chart_item_group,
		"chart_meal_type": chart_meal_type,
	}