/* ============================================================
 * Employee Explorer  –  Desk Page
 * route: /app/employee-explorer
 * ============================================================ */

frappe.pages["employee-explorer"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Employee Explorer"),
		single_column: true,
	});
	new EmployeeExplorer(page);
};

class EmployeeExplorer {
	constructor(page) {
		this.page = page;
		this.$wrap = $(page.body);
		this.employees = [];
		this.profile = null;

		this.inject_css();
		this.build_shell();
		this.bind_events();
		this.load_dashboard();
		this.load_employees();
	}

	/* ---------------- CSS ---------------- */
	inject_css() {
		if (document.getElementById("ee-style")) return;
		$(`<style id="ee-style">${`
.ee-app{background:#f4f6f9;border-radius:10px;padding:0 0 40px;min-height:75vh;font-size:13px;color:#1f2b3a}
.ee-topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;background:#fff;
  padding:14px 22px;border-bottom:1px solid #e6e9ef;border-radius:10px 10px 0 0;flex-wrap:wrap}
.ee-back{color:#1f6fe5;font-weight:600;cursor:pointer;margin-right:14px;font-size:13px}
.ee-title{color:#1f6fe5;font-size:22px;font-weight:700;margin:0;display:inline-block}
.ee-search-wrap{display:flex;gap:8px}
.ee-input{width:320px;padding:8px 12px;border:1px solid #d8dee8;border-radius:6px;outline:none;font-size:13px}
.ee-input:focus{border-color:#1f6fe5;box-shadow:0 0 0 2px rgba(31,111,229,.12)}
.ee-btn{padding:8px 18px;border-radius:6px;border:none;cursor:pointer;font-weight:600;font-size:13px}
.ee-btn-dark{background:#1f2937;color:#fff}
.ee-btn-dark:hover{background:#111827}
.ee-body{padding:20px 22px}

.ee-sec{margin-bottom:26px}
.ee-sec-title{display:flex;align-items:center;gap:9px;color:#1f6fe5;font-weight:700;font-size:16px;margin:0 0 14px}
.ee-sec-title i{font-size:16px}

.ee-grid-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.ee-stat{background:#fff;border:1px solid #e6e9ef;border-radius:9px;padding:16px 18px;border-left:5px solid #1f6fe5}
.ee-stat .lbl{font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px;text-transform:uppercase}
.ee-stat .val{font-size:26px;font-weight:700;color:#0f172a;margin-top:6px}

.ee-charts{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:900px){.ee-charts{grid-template-columns:1fr}}
.ee-panel{background:#fff;border:1px solid #e6e9ef;border-radius:9px;padding:16px 18px}
.ee-panel h4{margin:0 0 12px;font-size:13px;font-weight:700;color:#334155}

.ee-emp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}
.ee-emp-card{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #e6e9ef;
  border-radius:9px;padding:14px 16px;cursor:pointer;transition:.15s}
.ee-emp-card:hover{border-color:#1f6fe5;box-shadow:0 4px 14px rgba(31,111,229,.10);transform:translateY(-1px)}
.ee-avatar{width:46px;height:46px;border-radius:8px;background:#eef2f7;display:flex;align-items:center;
  justify-content:center;color:#94a3b8;font-size:20px;overflow:hidden;flex:0 0 46px}
.ee-avatar img{width:100%;height:100%;object-fit:cover}
.ee-emp-name{font-weight:700;font-size:14px;color:#1f6fe5;line-height:1.2}
.ee-emp-sub{font-size:12px;color:#64748b;margin-top:2px}
.ee-emp-meta{font-size:11px;color:#94a3b8;margin-top:3px}
.ee-emp-body{flex:1;min-width:0}
.ee-pill{font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase}
.ee-pill-green{background:#dcfce7;color:#15803d}
.ee-pill-red{background:#fee2e2;color:#b91c1c}
.ee-pill-grey{background:#e2e8f0;color:#475569}

/* profile */
.ee-profile-head{display:flex;gap:26px;background:#fff;border:1px solid #e6e9ef;border-radius:9px;padding:22px;align-items:flex-start;flex-wrap:wrap}
.ee-photo{width:120px;height:120px;border-radius:10px;background:#eef2f7;display:flex;align-items:center;
  justify-content:center;color:#94a3b8;font-size:44px;overflow:hidden;flex:0 0 120px}
.ee-photo img{width:100%;height:100%;object-fit:cover}
.ee-ph-name{font-size:24px;font-weight:700;color:#1f6fe5;margin:0}
.ee-ph-desig{font-size:14px;color:#64748b;margin-top:2px}
.ee-ph-cols{display:flex;gap:44px;margin-top:16px;flex-wrap:wrap}
.ee-ph-col .k{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.5px;text-transform:uppercase}
.ee-ph-col .v{font-size:13px;font-weight:600;color:#1e293b;margin-top:3px}

.ee-qid-card{display:flex;justify-content:space-between;align-items:center;background:#fff;
  border:1px solid #e6e9ef;border-left:6px solid #2dd4bf;border-radius:9px;padding:20px 24px}
.ee-qid-num{font-size:30px;font-weight:700;color:#0f172a;letter-spacing:1px}
.ee-qid-lbl{font-size:11px;font-weight:700;color:#64748b;letter-spacing:.6px}

.ee-info-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
@media(max-width:1100px){.ee-info-grid{grid-template-columns:repeat(2,1fr)}}
.ee-info-box{border:1px solid #e6e9ef;border-radius:6px;padding:9px 12px;background:#fff;min-height:52px}
.ee-info-box .k{font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:.4px;text-transform:uppercase}
.ee-info-box .v{font-size:12.5px;font-weight:600;color:#1e293b;margin-top:4px;word-break:break-word}

.ee-overview{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:1000px){.ee-overview{grid-template-columns:repeat(2,1fr)}}
.ee-ov{background:#fff;border:1px solid #e6e9ef;border-radius:9px;padding:16px 18px;border-left:5px solid #1f6fe5}
.ee-ov.o{border-left-color:#f59e0b}.ee-ov.g{border-left-color:#22c55e}.ee-ov.c{border-left-color:#06b6d4}
.ee-ov .k{font-size:10.5px;font-weight:700;color:#64748b;letter-spacing:.4px;text-transform:uppercase}
.ee-ov .v{font-size:24px;font-weight:700;color:#0f172a;margin-top:8px}
.ee-ov .s{font-size:11px;color:#94a3b8;margin-top:5px}

.ee-two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:1000px){.ee-two{grid-template-columns:1fr}}
.ee-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e6e9ef;border-radius:9px;overflow:hidden}
.ee-table th{text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;
  padding:10px 14px;border-bottom:1px solid #e6e9ef;background:#f8fafc}
.ee-table td{padding:10px 14px;font-size:12.5px;border-bottom:1px solid #f1f5f9;color:#334155}
.ee-table tr:last-child td{border-bottom:none}
.ee-table .total-row td{background:#f8fafc;font-weight:700;color:#0f172a}
.ee-badge{font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:20px}
.ee-badge-green{background:#dcfce7;color:#15803d}
.ee-badge-red{background:#fee2e2;color:#b91c1c}
.ee-empty{padding:22px;text-align:center;color:#94a3b8;font-size:12.5px;background:#fff;
  border:1px dashed #e2e8f0;border-radius:9px}
.ee-loading{padding:60px;text-align:center;color:#94a3b8}
`}</style>`).appendTo(document.head);
	}

	/* ---------------- SHELL ---------------- */
	build_shell() {
		this.$wrap.html(`
			<div class="ee-app">
				<div class="ee-topbar">
					<div style="display:flex;align-items:center">
						<span class="ee-back hide" id="ee-back">&larr; Back to Personnel</span>
						<h1 class="ee-title" id="ee-title">Employee Explorer</h1>
					</div>
					<div class="ee-search-wrap" id="ee-search-wrap">
						<input type="text" class="ee-input" id="ee-search"
							placeholder="Search by Name, ID or QID...">
						<button class="ee-btn ee-btn-dark" id="ee-search-btn">Search</button>
					</div>
				</div>
				<div class="ee-body" id="ee-body">
					<div class="ee-loading">Loading employees…</div>
				</div>
			</div>
		`);
		this.$body = this.$wrap.find("#ee-body");
	}

	bind_events() {
		this.$wrap.on("click", "#ee-search-btn", () => this.do_search());
		this.$wrap.on("keydown", "#ee-search", (e) => {
			if (e.key === "Enter") this.do_search();
		});
		this.$wrap.on("click", "#ee-back", () => this.show_list());
		this.$wrap.on("click", ".ee-emp-card", (e) => {
			const emp = $(e.currentTarget).data("name");
			if (emp) this.open_profile(emp);
		});
	}

	do_search() {
		this.state = this.state || {};
		this.state.search = this.$wrap.find("#ee-search").val() || "";
		this.load_employees();
	}

	/* ---------------- LIST ---------------- */
	load_employees() {
		const search = (this.state && this.state.search) || "";
		this.$body.html(`<div class="ee-loading">Loading employees…</div>`);

		frappe.call({
			method: "hrcustomization_synergy.hrcustomization_synergy.page.employee_explorer.employee_explorer.get_employees",
			args: { search: search },
		}).then((r) => {
			this.employees = r.message || [];
			this.render_list();
		});
	}

	load_dashboard() {
		frappe.call({
			method: "hrcustomization_synergy.hrcustomization_synergy.page.employee_explorer.employee_explorer.get_dashboard",
		}).then((r) => {
			this.dashboard = r.message || {};
			if (this.$body.find("#ee-stats").length) this.render_stats();
			if (this.$body.find("#ee-charts").length) this.render_charts();
		});
	}

	render_list() {
		this.$wrap.find("#ee-back").addClass("hide");
		this.$wrap.find("#ee-title").text("Employee Explorer");
		this.$wrap.find("#ee-search-wrap").removeClass("hide");

		this.$body.html(`
			<div class="ee-sec" id="ee-stats"></div>
			<div class="ee-sec" id="ee-charts"></div>
			<div class="ee-sec">
				<h3 class="ee-sec-title"><i class="fa fa-users"></i> Employees
					<span style="color:#94a3b8;font-weight:500;font-size:13px">
						(${this.employees.length})</span>
				</h3>
				<div class="ee-emp-grid" id="ee-emp-grid"></div>
			</div>
		`);

		this.render_stats();
		this.render_charts();

		const $g = this.$body.find("#ee-emp-grid");
		if (!this.employees.length) {
			$g.html(`<div class="ee-empty">No employee found.</div>`);
			return;
		}

		$g.html(this.employees.map((e) => {
			const av = e.image
				? `<img src="${e.image}">`
				: `<i class="fa fa-user"></i>`;
			return `
			<div class="ee-emp-card" data-name="${frappe.utils.escape_html(e.name)}">
				<div class="ee-avatar">${av}</div>
				<div class="ee-emp-body">
					<div class="ee-emp-name">${frappe.utils.escape_html(e.employee_name || e.name)}</div>
					<div class="ee-emp-sub">${frappe.utils.escape_html(e.designation || "-")}</div>
					<div class="ee-emp-meta">
						${frappe.utils.escape_html(e.department || "-")} •
						${frappe.utils.escape_html(e.employee_number || e.name)}
						${e.custom_qid_number ? " • QID " + frappe.utils.escape_html(e.custom_qid_number) : ""}
					</div>
				</div>
				${this.status_badge(e.status)}
			</div>`;
		}).join(""));
	}

	render_stats() {
		const d = this.dashboard;
		if (!d) return;
		const c = d.cards || {};
		this.$body.find("#ee-stats").html(`
			<h3 class="ee-sec-title"><i class="fa fa-bar-chart"></i> Overview</h3>
			<div class="ee-grid-cards">
				<div class="ee-stat"><div class="lbl">Total Employees</div><div class="val">${c.total || 0}</div></div>
				<div class="ee-stat" style="border-left-color:#22c55e"><div class="lbl">Active</div><div class="val">${c.active || 0}</div></div>
				<div class="ee-stat" style="border-left-color:#ef4444"><div class="lbl">Left</div><div class="val">${c.left || 0}</div></div>
				<div class="ee-stat" style="border-left-color:#f59e0b"><div class="lbl">Departments</div><div class="val">${c.departments || 0}</div></div>
			</div>
		`);
	}

	render_charts() {
		const d = this.dashboard;
		if (!d) return;
		this.$body.find("#ee-charts").html(`
			<h3 class="ee-sec-title"><i class="fa fa-pie-chart"></i> Analytics</h3>
			<div class="ee-charts">
				<div class="ee-panel"><h4>Employees by Department</h4><div id="ee-chart-dept"></div></div>
				<div class="ee-panel"><h4>Gender Distribution</h4><div id="ee-chart-gender"></div></div>
			</div>
		`);

		this.make_chart("#ee-chart-dept", {
			type: "bar",
			data: {
				labels: (d.by_department || []).map((x) => x.label),
				datasets: [{ values: (d.by_department || []).map((x) => x.value) }],
			},
			colors: ["#1f6fe5"],
		});

		this.make_chart("#ee-chart-gender", {
			type: "donut",
			data: {
				labels: (d.by_gender || []).map((x) => x.label),
				datasets: [{ values: (d.by_gender || []).map((x) => x.value) }],
			},
			colors: ["#1f6fe5", "#f472b6", "#94a3b8"],
		});
	}

	make_chart(sel, cfg) {
		const el = this.$body.find(sel)[0];
		if (!el) return;
		if (typeof frappe.Chart === "function") {
			new frappe.Chart(el, Object.assign({ height: 230, axisOptions: { xAxisMode: "tick" } }, cfg));
		} else {
			// fallback: simple bars
			const labels = cfg.data.labels || [];
			const values = (cfg.data.datasets[0] || {}).values || [];
			const max = Math.max(...values, 1);
			el.innerHTML = labels.map((l, i) => `
				<div style="margin-bottom:8px">
					<div style="display:flex;justify-content:space-between;font-size:11px;color:#475569">
						<span>${frappe.utils.escape_html(l)}</span><b>${values[i]}</b></div>
					<div style="height:7px;background:#eef2f7;border-radius:4px;margin-top:3px">
						<div style="width:${(values[i] / max) * 100}%;height:100%;background:#1f6fe5;border-radius:4px"></div>
					</div>
				</div>`).join("");
		}
	}

	/* ---------------- PROFILE ---------------- */
	open_profile(employee) {
		this.$body.html(`<div class="ee-loading">Loading profile…</div>`);
		this.$wrap.find("#ee-back").removeClass("hide");
		this.$wrap.find("#ee-search-wrap").addClass("hide");

		frappe.call({
			method: "hrcustomization_synergy.hrcustomization_synergy.page.employee_explorer.employee_explorer.get_employee_profile",
			args: { employee: employee },
		}).then((r) => {
			if (!r.message) return;
			this.profile = r.message;
			this.$wrap.find("#ee-title").text(r.message.employee.employee_name || employee);
			this.render_profile(r.message);
		});
	}

	show_list() {
		this.render_list();
		this.load_dashboard();
	}

	render_profile(p) {
		const e = p.employee || {};
		const avatar = e.image
			? `<img src="${e.image}">`
			: `<i class="fa fa-user"></i>`;

		const general = [
			["CODE", e.employee_number], ["NAME", e.employee_name],
			["DESIGNATION", e.designation], ["NATIONALITY", e.nationality],
			["JOINING DATE", this.d(e.date_of_joining)],

			["STATUS", e.status], ["COMPANY", e.company],
			["EMAIL", e.personal_email || e.company_email],
			["DOB", this.d(e.date_of_birth)], ["ROLE", e.custom_role || "-"],

			["ADDRESS", e.current_address || e.permanent_address || "-"],
			["DEPARTMENT", e.department], ["RELIGION", e.religion],
			["LOCATION", e.branch || e.location || "-"], ["", ""],

			["CONTACT", e.cell_number], ["EMPLOYEE NO", e.employee_number],
			["STAFF A", e.custom_staff_category || "-"],
			["BANK", e.bank_name || "-"], ["IBAN", e.iban || e.bank_ac_no || "-"],

			["EMP_STATUS", e.status], ["EXIT_DATE", this.d(e.relieving_date)],
			["EMP_QID", e.custom_qid_number],
			["REPORTING MANAGER", e.reports_to || "-"], ["", ""],
		];

		this.$body.html(`
			<!-- HEADER -->
			<div class="ee-sec">
				<div class="ee-profile-head">
					<div class="ee-photo">${avatar}</div>
					<div style="flex:1;min-width:260px">
						<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
							<div>
								<h2 class="ee-ph-name">${frappe.utils.escape_html(e.employee_name || e.name)}</h2>
								<div class="ee-ph-desig">${frappe.utils.escape_html(e.designation || "")}</div>
							</div>
							${this.status_badge(e.status)}
						</div>
						<div class="ee-ph-cols">
							<div class="ee-ph-col"><div class="k">Employee ID</div>
								<div class="v">${frappe.utils.escape_html(e.employee_number || e.name)}</div></div>
							<div class="ee-ph-col"><div class="k">Department</div>
								<div class="v">${frappe.utils.escape_html(e.department || "-")}</div></div>
							<div class="ee-ph-col"><div class="k">Location</div>
								<div class="v">${frappe.utils.escape_html(e.branch || e.location || "-")}</div></div>
							<div class="ee-ph-col"><div class="k">Joining Date</div>
								<div class="v">${this.d(e.date_of_joining)}</div></div>
						</div>
					</div>
				</div>
			</div>

			<!-- IDENTIFICATION -->
			<div class="ee-sec">
				<h3 class="ee-sec-title"><i class="fa fa-id-card-o"></i> Identification Details</h3>
				<div class="ee-qid-card">
					<div>
						<div class="ee-qid-lbl">QID NUMBER</div>
						<div class="ee-qid-num">${frappe.utils.escape_html(p.identification.qid_number || "-")}</div>
					</div>
					<div style="text-align:right">
						<div class="ee-qid-lbl">EXPIRY DATE</div>
						<div style="font-size:16px;font-weight:700;color:#0f172a;margin:6px 0">
							${this.d(p.identification.qid_expiry)}</div>
						${this.validity_badge(p.identification.qid_expiry)}
					</div>
				</div>
			</div>

			<!-- GENERAL -->
			<div class="ee-sec">
				<h3 class="ee-sec-title"><i class="fa fa-info-circle"></i> General Information</h3>
				<div class="ee-info-grid">
					${general.map(([k, v]) => `
						<div class="ee-info-box">
							<div class="k">${frappe.utils.escape_html(k || "")}</div>
							<div class="v">${frappe.utils.escape_html(this.s(v))}</div>
						</div>`).join("")}
				</div>
			</div>

			<!-- LEAVE & GRATUITY -->
			<div class="ee-sec">
				<h3 class="ee-sec-title"><i class="fa fa-calendar-check-o"></i> Leave &amp; Gratuity</h3>

				<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px;margin-bottom:10px">OVERVIEW</div>
				<div class="ee-overview" style="margin-bottom:22px">
					<div class="ee-ov">
						<div class="k">Total Annual Balance</div>
						<div class="v">${this.n(p.leave.overview.total_annual_balance)} Days</div>
						<div class="s">Closing Date : ${p.leave.overview.closing_date}</div>
					</div>
					<div class="ee-ov o">
						<div class="k">Unpaid Leaves</div>
						<div class="v">${this.n(p.leave.overview.unpaid_leaves)} Days</div>
						<div class="s">&nbsp;</div>
					</div>
					<div class="ee-ov g">
						<div class="k">Service Period</div>
						<div class="v" style="font-size:20px">${p.service.text}</div>
						<div class="s">Joined : ${this.d(e.date_of_joining)}</div>
					</div>
					<div class="ee-ov c">
						<div class="k">Gratuity Amount</div>
						<div class="v">${this.money(p.gratuity.amount)}</div>
						<div class="s">As Of ${p.gratuity.as_on}</div>
					</div>
				</div>

				<div class="ee-two">
					<div>
						<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px;margin-bottom:8px">ANNUAL LEAVE BREAKDOWN</div>
						<table class="ee-table">
							<thead><tr><th>Description</th><th style="text-align:right">Days Count</th></tr></thead>
							<tbody>
								${p.leave.annual_breakdown.map((r) => `
									<tr><td>${frappe.utils.escape_html(r.label)}</td>
									<td style="text-align:right">${this.n(r.value)}</td></tr>`).join("")}
							</tbody>
						</table>
					</div>

					<div>
						<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px;margin-bottom:8px">OTHER LEAVE BALANCES</div>
						<table class="ee-table">
							<thead><tr>
								<th>Leave Type</th>
								<th style="text-align:right">Eligible</th>
								<th style="text-align:right">Utilized</th>
								<th style="text-align:right">Balance</th>
							</tr></thead>
							<tbody>
								${p.leave.other_balances.length
									? p.leave.other_balances.map((r) => `
										<tr>
											<td>${frappe.utils.escape_html(r.leave_type)}</td>
											<td style="text-align:right">${this.n(r.eligible)}</td>
											<td style="text-align:right">${this.n(r.utilized)}</td>
											<td style="text-align:right"><b>${this.n(r.balance)}</b></td>
										</tr>`).join("")
									: `<tr><td colspan="4" style="text-align:center;color:#94a3b8">No leave allocation found</td></tr>`}
							</tbody>
						</table>
					</div>
				</div>

				<div style="margin-top:20px">
					<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px;margin-bottom:8px">LEAVE HISTORY</div>
					${p.leave.history.length ? `
						<table class="ee-table">
							<thead><tr>
								<th>Leave Type</th><th>From</th><th>To</th>
								<th style="text-align:right">Days</th><th>Status</th>
							</tr></thead>
							<tbody>
								${p.leave.history.map((h) => `
									<tr>
										<td>${frappe.utils.escape_html(h.leave_type)}</td>
										<td>${this.d(h.from_date)}</td>
										<td>${this.d(h.to_date)}</td>
										<td style="text-align:right">${this.n(h.total_leave_days)}</td>
										<td>${frappe.utils.escape_html(h.status)}</td>
									</tr>`).join("")}
							</tbody>
						</table>` : `<div class="ee-empty">No leave history found.</div>`}
				</div>
			</div>

			<!-- DOCUMENTS -->
			<div class="ee-sec">
				<h3 class="ee-sec-title"><i class="fa fa-folder-open-o"></i> Documents</h3>
				${p.documents.length ? `
					<table class="ee-table">
						<thead><tr>
							<th>Document Type</th><th>Name</th><th>Doc No.</th>
							<th>Issue Date</th><th>Expiry Date</th><th>Status</th>
						</tr></thead>
						<tbody>
							${p.documents.map((d) => `
								<tr>
									<td>${frappe.utils.escape_html(d.document_type || "-")}</td>
									<td>${frappe.utils.escape_html(d.name || "-")}</td>
									<td>${frappe.utils.escape_html(d.document_number || "-")}</td>
									<td>${this.d(d.issue_date)}</td>
									<td>${this.d(d.expiry_date)}</td>
									<td>${d.status === "Valid"
										? `<span class="ee-badge ee-badge-green">Valid</span>`
										: `<span class="ee-badge ee-badge-red">Expired</span>`}</td>
								</tr>`).join("")}
						</tbody>
					</table>` : `<div class="ee-empty">No documents found.</div>`}
			</div>

			<!-- SALARY -->
			<div class="ee-sec">
				<h3 class="ee-sec-title"><i class="fa fa-money"></i> Salary &amp; Benefits</h3>
				${p.salary.components.length ? `
					<table class="ee-table" style="max-width:640px">
						<thead><tr><th>Component</th><th style="text-align:right">Amount</th></tr></thead>
						<tbody>
							${p.salary.components.map((c) => `
								<tr><td>${frappe.utils.escape_html(c.label)}</td>
								<td style="text-align:right">${this.money(c.amount)}</td></tr>`).join("")}
							<tr class="total-row">
								<td>Total</td>
								<td style="text-align:right">${this.money(p.salary.total)}</td>
							</tr>
						</tbody>
					</table>
					<div style="font-size:11.5px;color:#94a3b8;margin-top:8px">
						Structure: ${frappe.utils.escape_html(p.salary.salary_structure || "-")} •
						Effective From: ${this.d(p.salary.from_date)}
					</div>` : `<div class="ee-empty">No salary structure assigned.</div>`}
			</div>

			<!-- FAMILY & TICKETS -->
			<div class="ee-sec">
				<h3 class="ee-sec-title"><i class="fa fa-plane"></i> Family &amp; Tickets</h3>
				<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px;margin-bottom:10px">
					AIR TICKET NEXT AVAILMENT</div>
				<div class="ee-two" style="max-width:820px">
					<div class="ee-ov c">
						<div class="k">Next Availment Date</div>
						<div class="v" style="font-size:20px">
							${p.tickets.next_availment_date ? this.d(p.tickets.next_availment_date) : "-"}</div>
						<div class="s">Frequency : ${p.tickets.frequency_months || 0} month(s)</div>
					</div>
					<div class="ee-ov">
						<div class="k">Last Availed Date</div>
						<div class="v" style="font-size:20px">${this.d(p.tickets.last_ticket_date)}</div>
						<div class="s">Method : ${frappe.utils.escape_html(p.tickets.last_availment_method || "-")}</div>
					</div>
				</div>
				<div class="ee-info-grid" style="margin-top:14px;grid-template-columns:repeat(4,1fr)">
					<div class="ee-info-box"><div class="k">Tickets Availed</div>
						<div class="v">${this.n(p.tickets.ticket_count)}</div></div>
					<div class="ee-info-box"><div class="k">Ticket Amount</div>
						<div class="v">${this.money(p.tickets.ticket_amount)}</div></div>
					<div class="ee-info-box"><div class="k">Destination</div>
						<div class="v">${frappe.utils.escape_html(p.tickets.destination || "-")}</div></div>
					<div class="ee-info-box"><div class="k">Eligibility</div>
						<div class="v">${frappe.utils.escape_html(p.tickets.eligibility || "-")}</div></div>
				</div>
				<div class="ee-info-grid" style="margin-top:10px;grid-template-columns:repeat(4,1fr)">
					<div class="ee-info-box"><div class="k">Ticket Entitlement</div>
						<div class="v">${this.money(p.tickets.entitlement)}</div></div>
					<div class="ee-info-box"><div class="k">Frequency (Months)</div>
						<div class="v">${p.tickets.frequency_months || 0}</div></div>
				</div>
			</div>
		`);
	}

	/* ---------------- small helpers ---------------- */
	status_badge(status) {
		const s = (status || "").toLowerCase();
		if (s === "active") return `<span class="ee-pill ee-pill-green">Active</span>`;
		if (s === "left")   return `<span class="ee-pill ee-pill-red">Left</span>`;
		return `<span class="ee-pill ee-pill-grey">${frappe.utils.escape_html(status || "-")}</span>`;
	}

	validity_badge(date) {
		if (!date) return "";
		const today = frappe.datetime.get_today();
		const d = String(date).slice(0, 10);
		return d >= today
			? `<span class="ee-badge ee-badge-green">Valid</span>`
			: `<span class="ee-badge ee-badge-red">Expired</span>`;
	}

	d(v) {
		if (!v) return "-";
		try { return frappe.datetime.str_to_user(String(v).slice(0, 10)); }
		catch (e) { return String(v).slice(0, 10); }
	}

	s(v) {
		if (v === null || v === undefined || v === "") return "-";
		return String(v);
	}

	n(v) {
		const x = flt(v || 0);
		return Number.isInteger(x) ? x : x.toFixed(2);
	}

	money(v) {
		return flt(v || 0).toLocaleString("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
	}
}