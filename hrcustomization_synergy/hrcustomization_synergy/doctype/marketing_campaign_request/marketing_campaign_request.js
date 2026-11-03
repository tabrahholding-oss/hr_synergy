// Copyright (c) 2026, Tabrah Holding
const MCR_METHOD = "hrcustomization_synergy.hrcustomization_synergy.doctype.marketing_campaign_request.marketing_campaign_request";

frappe.ui.form.on("Marketing Campaign Request", {
	setup(frm) {
		frm.set_query("cost_center", () => ({ filters: { company: frm.doc.company, is_group: 0, disabled: 0 } }));
		frm.set_query("expense_account", () => ({ filters: { company: frm.doc.company, root_type: "Expense", is_group: 0, disabled: 0 } }));
		// Holding Marketing raises requests for subsidiaries
		frm.set_query("department", () => ({ filters: { company: ["in", [frm.doc.company, "Tabrah Holding"]], is_group: 0 } }));
		frm.set_query("related_request", () => ({ filters: { company: frm.doc.company, docstatus: 1 } }));
		frm.set_query("project", () => ({ filters: { company: frm.doc.company } }));
		frm.set_query("item_code", "budget_items", () => ({ filters: { is_stock_item: 0, disabled: 0 } }));
	},

	onload(frm) {
		if (frm.is_new() && !frm.doc.requested_by) {
			frappe.db.get_value("Employee", { user_id: frappe.session.user, status: "Active" }, "name")
				.then((r) => r.message && r.message.name && frm.set_value("requested_by", r.message.name));
		}
	},

	refresh(frm) {
		if (frm.doc.docstatus !== 1) return;
		const can_manage = frappe.user.has_role("Marketing Manager") || frappe.user.has_role("System Manager");
		const moves = { "Approved": ["In Progress", "On Hold"], "In Progress": ["On Hold", "Completed"], "On Hold": ["In Progress", "Completed"] };
		if (can_manage) {
			(moves[frm.doc.status] || []).forEach((status) => {
				frm.add_custom_button(__(status), () => {
					frappe.call({ method: `${MCR_METHOD}.set_campaign_status`, args: { name: frm.doc.name, status } })
						.then(() => frm.reload_doc());
				}, __("Set Status"));
			});
		}
		if (["Approved", "In Progress"].includes(frm.doc.status)) {
			frm.add_custom_button(__("Material Request"), () => {
				frappe.call({ method: `${MCR_METHOD}.make_material_request`, args: { source_name: frm.doc.name } })
					.then((r) => {
						const doc = frappe.model.sync(r.message)[0];
						frappe.set_route("Form", doc.doctype, doc.name);
					});
			}, __("Create"));
		}
	},

	company(frm) {
		if (!frm.doc.company) return;
		frappe.call({ method: `${MCR_METHOD}.get_company_defaults`, args: { company: frm.doc.company } }).then((r) => {
			const d = r.message || {};
			frm.set_value("cost_center", d.cost_center || "");
			frm.set_value("expense_account", d.expense_account || "");
		});
	},

	start_date: (frm) => mcr.duration(frm),
	end_date: (frm) => mcr.duration(frm),
	contingency_percent: (frm) => mcr.totals(frm),
	expected_revenue: (frm) => mcr.totals(frm),
	expected_conversions: (frm) => mcr.totals(frm),
	avg_transaction_value: (frm) => mcr.totals(frm),
	budget_items_remove: (frm) => mcr.totals(frm),
	channels_remove: (frm) => mcr.totals(frm),
});

frappe.ui.form.on("Marketing Campaign Request Budget Item", {
	qty: (frm, cdt, cdn) => mcr.line(frm, cdt, cdn),
	rate: (frm, cdt, cdn) => mcr.line(frm, cdt, cdn),
});

frappe.ui.form.on("Marketing Campaign Request Channel", {
	allocated_budget: (frm) => mcr.totals(frm),
});

frappe.ui.form.on("Marketing Campaign Request Offer Item", {
	item_code(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item_code) return;
		frappe.db.get_value("Item Price", { item_code: row.item_code, selling: 1, currency: frm.doc.currency }, "price_list_rate")
			.then((r) => r.message && frappe.model.set_value(cdt, cdn, "regular_price", r.message.price_list_rate));
	},
	regular_price: (frm, cdt, cdn) => mcr.offer(cdt, cdn),
	offer_price: (frm, cdt, cdn) => mcr.offer(cdt, cdn),
	expected_qty: (frm, cdt, cdn) => mcr.offer(cdt, cdn),
});

frappe.ui.form.on("Marketing Campaign Request KPI", {
	actual: (frm, cdt, cdn) => mcr.kpi(cdt, cdn),
	target: (frm, cdt, cdn) => mcr.kpi(cdt, cdn),
});

// Display-only helpers; the server recalculates everything on save.
const mcr = {
	duration(frm) {
		if (frm.doc.start_date && frm.doc.end_date) {
			frm.set_value("duration_days", frappe.datetime.get_diff(frm.doc.end_date, frm.doc.start_date) + 1);
		}
	},
	line(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, "amount", flt(row.qty) * flt(row.rate));
		mcr.totals(frm);
	},
	offer(cdt, cdn) {
		const row = locals[cdt][cdn];
		const reg = flt(row.regular_price);
		frappe.model.set_value(cdt, cdn, "discount_percent", reg ? ((reg - flt(row.offer_price)) / reg) * 100 : 0);
		frappe.model.set_value(cdt, cdn, "expected_revenue", flt(row.offer_price) * flt(row.expected_qty));
	},
	kpi(cdt, cdn) {
		const row = locals[cdt][cdn];
		frappe.model.set_value(cdt, cdn, "achievement", flt(row.target) ? (flt(row.actual) / flt(row.target)) * 100 : 0);
	},
	totals(frm) {
		const sub = (frm.doc.budget_items || []).reduce((s, r) => s + flt(r.amount), 0);
		const cont = (sub * flt(frm.doc.contingency_percent)) / 100;
		const total = sub + cont;
		frm.set_value("budget_subtotal", sub);
		frm.set_value("contingency_amount", cont);
		frm.set_value("total_budget", total);
		frm.set_value("total_channel_budget", (frm.doc.channels || []).reduce((s, r) => s + flt(r.allocated_budget), 0));
		frm.set_value("projected_roi", total ? ((flt(frm.doc.expected_revenue) - total) / total) * 100 : 0);
		frm.set_value("projected_cpa", cint(frm.doc.expected_conversions) ? total / cint(frm.doc.expected_conversions) : 0);
		frm.set_value("break_even_conversions", flt(frm.doc.avg_transaction_value) ? Math.ceil(total / flt(frm.doc.avg_transaction_value)) : 0);
	},
};
