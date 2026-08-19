import frappe
from frappe import _
from frappe.utils import fmt_money
from datetime import datetime

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
    if filters.get("payment_method"):
        conditions += " AND sip.mode_of_payment = %(payment_method)s"
    if filters.get("meal_type"):
        if filters.get("meal_type") == "Breakfast":
            conditions += " AND si.posting_time < '12:00:00'"
        elif filters.get("meal_type") == "Lunch":
            conditions += " AND si.posting_time >= '12:00:00' AND si.posting_time < '18:00:00'"
        elif filters.get("meal_type") == "Dinner":
            conditions += " AND si.posting_time >= '18:00:00'"

    query = f"""
        SELECT 
            si.name AS sales_invoice, si.company, si.customer, si.posting_date, si.posting_time,
            COALESCE(si.cover, 0) AS cover,
            CASE 
                WHEN si.posting_time < '12:00:00' THEN 'Breakfast'
                WHEN si.posting_time < '18:00:00' THEN 'Lunch'
                ELSE 'Dinner'
            END AS meal_type,
            si.resturent_type AS order_type,
            COALESCE(sip.mode_of_payment, 'Unassigned') AS payment_method,
            sii.item_code, 
            COALESCE(sii.item_name, sii.item_code) AS item_name, 
            i.item_group, sii.qty, sii.rate, sii.amount AS sales_amount,
            COALESCE(slec.cost_of_sale, 0) AS cost_of_sale,
            (sii.amount - COALESCE(slec.cost_of_sale, 0)) AS gross_profit
        FROM `tabSales Invoice` si
        INNER JOIN `tabSales Invoice Item` sii ON sii.parent = si.name AND sii.parenttype = 'Sales Invoice'
        LEFT JOIN `tabSales Invoice Payment` sip ON sip.parent = si.name AND sip.parenttype = 'Sales Invoice'
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
    
    invoice_covers = {}
    for row in data:
        inv = row.get("sales_invoice")
        if inv and inv not in invoice_covers:
            invoice_covers[inv] = row.get("cover", 0)
            
    total_invoices = len(invoice_covers)
    total_pax = sum(invoice_covers.values())

    item_groups = {}
    meal_types = {"Breakfast": 0, "Lunch": 0, "Dinner": 0}
    order_types = {}
    payment_methods = {}
    hourly_sales = {}

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

        o_type = row.get("order_type") or "Unassigned"
        inv_no = row.get("sales_invoice")
        if o_type not in order_types:
            order_types[o_type] = {"amount": 0, "invoices": set(), "pax": 0}
        order_types[o_type]["amount"] += row.get("sales_amount", 0)
        if inv_no and inv_no not in order_types[o_type]["invoices"]:
            order_types[o_type]["invoices"].add(inv_no)
            order_types[o_type]["pax"] += row.get("cover", 0)

        p_method = row.get("payment_method") or "Unassigned"
        if p_method not in payment_methods:
            payment_methods[p_method] = {"amount": 0, "invoices": set()}
        payment_methods[p_method]["amount"] += row.get("sales_amount", 0)
        if inv_no:
            payment_methods[p_method]["invoices"].add(inv_no)

        p_date = str(row.get("posting_date"))
        p_time = str(row.get("posting_time"))
        try:
            hour_val = datetime.strptime(p_time.split('.')[0], "%H:%M:%S").strftime("%I %p").lstrip('0')
            hour_sort = datetime.strptime(p_time.split('.')[0], "%H:%M:%S").hour
        except Exception:
            hour_val = "12 AM"
            hour_sort = 0

        key = (p_date, hour_sort, hour_val)
        if key not in hourly_sales:
            hourly_sales[key] = {"amount": 0, "invoices": set(), "pax": 0}

        hourly_sales[key]["amount"] += row.get("sales_amount", 0)
        if inv_no and inv_no not in hourly_sales[key]["invoices"]:
            hourly_sales[key]["invoices"].add(inv_no)
            hourly_sales[key]["pax"] += row.get("cover", 0)

    # Charts Payload
    chart_item_group = {
        "labels": list(item_groups.keys()),
        "values": [round(v["sales"], 2) for v in item_groups.values()]
    }
    chart_sales_vs_cost = {
        "labels": list(item_groups.keys()),
        "sales": [round(v["sales"], 2) for v in item_groups.values()],
        "cost": [round(v["cost"], 2) for v in item_groups.values()]
    }
    chart_payment_method = {
        "labels": list(payment_methods.keys()),
        "values": [round(v["amount"], 2) for v in payment_methods.values()]
    }
    chart_meal_type = {
        "labels": list(meal_types.keys()),
        "values": [round(val, 2) for val in meal_types.values()]
    }

    # Rows HTML
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

    order_rows_html = "".join([
        f"<tr><td style='padding:8px; border-bottom:1px solid #e2e8f0;'><strong>{o}</strong></td>"
        f"<td style='padding:8px; text-align:center; border-bottom:1px solid #e2e8f0;'>{len(v['invoices'])}</td>"
        f"<td style='padding:8px; text-align:center; border-bottom:1px solid #e2e8f0;'>{int(v['pax'])}</td>"
        f"<td style='padding:8px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(v['amount'])}</td></tr>"
        for o, v in order_types.items()
    ])

    payment_rows_html = "".join([
        f"<tr><td style='padding:8px; border-bottom:1px solid #e2e8f0;'><strong>{p}</strong></td>"
        f"<td style='padding:8px; text-align:center; border-bottom:1px solid #e2e8f0;'>{len(v['invoices'])}</td>"
        f"<td style='padding:8px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(v['amount'])}</td></tr>"
        for p, v in payment_methods.items()
    ])

    hourly_rows_list = []
    sorted_hourly_keys = sorted(hourly_sales.keys(), key=lambda x: (x[0], x[1]))
    current_date = None
    for key in sorted_hourly_keys:
        p_date, _, hour_label = key
        val = hourly_sales[key]
        date_display = p_date if p_date != current_date else ""
        current_date = p_date

        hourly_rows_list.append(
            f"<tr>"
            f"<td style='padding:8px; border-bottom:1px solid #e2e8f0; font-weight:600;'>{date_display}</td>"
            f"<td style='padding:8px; border-bottom:1px solid #e2e8f0;'>{hour_label}</td>"
            f"<td style='padding:8px; text-align:center; border-bottom:1px solid #e2e8f0;'>{len(val['invoices'])}</td>"
            f"<td style='padding:8px; text-align:center; border-bottom:1px solid #e2e8f0;'>{int(val['pax'])}</td>"
            f"<td style='padding:8px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(val['amount'])}</td>"
            f"</tr>"
        )
    hourly_rows_html = "".join(hourly_rows_list)

    detail_rows_html = "".join([
        f"<tr><td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.sales_invoice}</td>"
        f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{str(row.posting_date)}</td>"
        f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.meal_type}</td>"
        f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.order_type or ''}</td>"
        f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.payment_method}</td>"
        f"<td style='padding:6px; border-bottom:1px solid #e2e8f0;'>{row.item_name}</td>"
        f"<td style='padding:6px; text-align:right; border-bottom:1px solid #e2e8f0;'>{row.qty}</td>"
        f"<td style='padding:6px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(row.sales_amount)}</td>"
        f"<td style='padding:6px; text-align:right; border-bottom:1px solid #e2e8f0;'>{fmt_money(row.cost_of_sale)}</td></tr>"
        for row in data[:50]
    ])

    html = f"""
    <div style="padding: 10px; font-family: sans-serif; background: #f8fafc;">
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
        
        <div style="text-align:center; font-weight:bold; margin-bottom:20px; font-size:15px; color:#475569;">
            {total_invoices} INVOICES &nbsp;|&nbsp; {int(total_pax)} PAX
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px; margin-bottom: 25px;">
            <div style="display: flex; gap: 20px;">
                <div style="flex: 1; background: #fff; padding: 20px; border-radius: 8px; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
                    <h5 style="margin-top:0; font-weight: 600; color: #1e293b;">Sales by Item Group</h5>
                    <div id="apex-chart-item-group" style="min-height: 330px;"></div>
                </div>
                <div style="flex: 1; background: #fff; padding: 20px; border-radius: 8px; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
                    <h5 style="margin-top:0; font-weight: 600; color: #1e293b;">Sales vs Cost of Sales</h5>
                    <div id="apex-chart-sales-cost" style="min-height: 330px;"></div>
                </div>
            </div>

            <div style="display: flex; gap: 20px;">
                <div style="flex: 1; background: #fff; padding: 20px; border-radius: 8px; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
                    <h5 style="margin-top:0; font-weight: 600; color: #1e293b;">Sales Trends by Payment Method</h5>
                    <div id="apex-chart-payment-method" style="min-height: 280px;"></div>
                </div>
                <div style="flex: 1; background: #fff; padding: 20px; border-radius: 8px; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
                    <h5 style="margin-top:0; font-weight: 600; color: #1e293b;">Sales by Meal Type</h5>
                    <div id="apex-chart-meal-type" style="min-height: 280px;"></div>
                </div>
            </div>
        </div>

        <!-- Tables View Setup -->
        <div style="display: flex; gap: 20px; margin-bottom: 25px;">
            <!-- Left Column: Item Group Table & Hourly Table -->
            <div style="flex: 2; display: flex; flex-direction: column; gap: 20px;">
                <div style="background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
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

                <!-- HOURLY SALES BREAKDOWN TABLE PLACED DIRECTLY BELOW ITEM GROUP TABLE -->
                <div style="background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                    <h5 style="margin-top:0; color: #1e293b; text-align:center;">HOURLY SALES BREAKDOWN</h5>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align:left;">Date</th>
                                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align:left;">Hours</th>
                                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #cbd5e1;">Count Invoice</th>
                                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #cbd5e1;">PAX</th>
                                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>{hourly_rows_html}</tbody>
                    </table>
                </div>
            </div>
            
            <!-- Right Column: Meal, Order Type & Payment Method Tables -->
            <div style="flex: 1; display: flex; flex-direction: column; gap: 20px;">
                <div style="background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
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

                <div style="background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                    <h5 style="margin-top:0; color: #1e293b; text-align:center;">SALES BY ORDER TYPE</h5>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align:left;">Order Type</th>
                                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #cbd5e1;">Count</th>
                                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #cbd5e1;">PAX</th>
                                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>{order_rows_html}</tbody>
                    </table>
                </div>

                <div style="background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                    <h5 style="margin-top:0; color: #1e293b; text-align:center;">SALES BY PAYMENT METHOD</h5>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 8px; border-bottom: 2px solid #cbd5e1; text-align:left;">Method</th>
                                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #cbd5e1;">Count</th>
                                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>{payment_rows_html}</tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Raw Grid Data -->
        <div style="background: #fff; padding: 15px; border-radius: 6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <h5 style="margin-top:0; color: #1e293b; text-align:center;">DETAIL DATA (Top 50 Rows)</h5>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background: #f8fafc; text-align:left;">
                        <th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Invoice</th>
                        <th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Date</th>
                        <th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Meal</th>
                        <th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Order Type</th>
                        <th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Payment Method</th>
                        <th style="padding: 6px; border-bottom: 2px solid #cbd5e1;">Item Name</th>
                        <th style="padding: 6px; text-align:right; border-bottom: 2px solid #cbd5e1;">Qty</th>
                        <th style="padding: 6px; text-align:right; border-bottom: 2px solid #cbd5e1;">Sales</th>
                        <th style="padding: 6px; text-align:right; border-bottom: 2px solid #cbd5e1;">Cost</th>
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
        "chart_sales_vs_cost": chart_sales_vs_cost,
        "chart_payment_method": chart_payment_method,
        "chart_meal_type": chart_meal_type
    }