/* ============================================================
 * Employee Explorer  –  Desk Page (v2)
 * ============================================================ */

frappe.pages["employee-explorer"].on_page_load = function (wrapper) {
	const roles = frappe.user_roles || [];
	const allowed = ["Employee Explorer User", "System Manager"];
	if (!allowed.some(r => roles.includes(r))) {
		frappe.msgprint({
			title: __("Access Denied"),
			indicator: "red",
			message: __("Aap ko Employee Explorer access karne ki ijazat nahi hai."),
		});
		setTimeout(() => frappe.set_route("app"), 1500);
		return;
	}

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
		this.state = {
			search: "",
			company: "",
			status: "",
			employment_type: "",
		};
		this._search_timer = null;
		this._filter_options_loaded = false;

		this.inject_css();
		this.build_shell();
		this.bind_events();
		this.load_filter_options();
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
.ee-search-wrap{display:flex;gap:8px;position:relative}
.ee-search-box{position:relative}
.ee-input{width:320px;padding:8px 32px 8px 12px;border:1px solid #d8dee8;border-radius:6px;
  outline:none;font-size:13px;background:#fff}
.ee-input:focus{border-color:#1f6fe5;box-shadow:0 0 0 2px rgba(31,111,229,.12)}
.ee-search-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);
  background:transparent;border:none;cursor:pointer;color:#94a3b8;font-size:14px;
  padding:4px 6px;border-radius:4px;display:none;line-height:1}
.ee-search-clear:hover{background:#f1f5f9;color:#475569}
.ee-search-clear.show{display:block}
.ee-dropdown{position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #d8dee8;
  border-radius:8px;margin-top:6px;max-height:380px;overflow-y:auto;z-index:1200;
  box-shadow:0 12px 32px rgba(15,23,42,.12);display:none}
.ee-dropdown.show{display:block}
.ee-dropdown-item{padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;
  border-bottom:1px solid #f1f5f9}
.ee-dropdown-item:last-child{border-bottom:none}
.ee-dropdown-item:hover{background:#f8fafc}
.ee-dropdown-item .av{width:34px;height:34px;border-radius:6px;background:#eef2f7;display:flex;
  align-items:center;justify-content:center;color:#94a3b8;font-size:14px;overflow:hidden;flex:0 0 34px}
.ee-dropdown-item .av img{width:100%;height:100%;object-fit:cover}
.ee-dropdown-item .body{flex:1;min-width:0}
.ee-dropdown-item .nm{font-weight:700;color:#1f6fe5;font-size:13px;line-height:1.2}
.ee-dropdown-item .sb{font-size:11.5px;color:#64748b;margin-top:2px}
.ee-dropdown-empty{padding:16px;text-align:center;color:#94a3b8;font-size:12.5px}
.ee-btn{padding:8px 18px;border-radius:6px;border:none;cursor:pointer;font-weight:600;font-size:13px}
.ee-btn-dark{background:#1f2937;color:#fff}
.ee-btn-dark:hover{background:#111827}
.ee-body{padding:20px 22px}

.ee-sec{margin-bottom:26px}
.ee-sec-title{display:flex;align-items:center;gap:9px;color:#1f6fe5;font-weight:700;font-size:16px;margin:0 0 14px}
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

.ee-profile-head{display:flex;gap:26px;background:#fff;border:1px solid #e6e9ef;border-radius:9px;
  padding:22px;align-items:flex-start;flex-wrap:wrap}
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
  padding:10px 14px;border-bottom:1px solid #e6e9ef;background:#f8fafc;white-space:nowrap}
.ee-table td{padding:10px 14px;font-size:12.5px;border-bottom:1px solid #f1f5f9;color:#334155;white-space:nowrap}
.ee-table tr:last-child td{border-bottom:none}
.ee-table .total-row td{background:#f8fafc;font-weight:700;color:#0f172a}
.ee-badge{font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:20px}
.ee-badge-green{background:#dcfce7;color:#15803d}
.ee-badge-red{background:#fee2e2;color:#b91c1c}
.ee-empty{padding:22px;text-align:center;color:#94a3b8;font-size:12.5px;background:#fff;
  border:1px dashed #e2e8f0;border-radius:9px}
.ee-loading{padding:60px;text-align:center;color:#94a3b8}

/* Tabs */
.ee-tabs{display:flex;gap:2px;border-bottom:2px solid #e6e9ef;margin-bottom:22px;margin-top:20px}
.ee-tab{background:transparent;border:none;padding:11px 22px;font-size:13.5px;font-weight:600;
  color:#64748b;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;
  display:flex;align-items:center;gap:8px}
.ee-tab:hover{color:#1f6fe5}
.ee-tab.active{color:#1f6fe5;border-bottom-color:#1f6fe5}
.ee-tab-panel.hide{display:none}

/* Leave history filter */
.ee-filter-row{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.ee-select{padding:7px 12px;border:1px solid #d8dee8;border-radius:6px;font-size:12.5px;
  background:#fff;color:#334155;outline:none;min-width:160px}
.ee-select:focus{border-color:#1f6fe5}
.ee-btn-mini{padding:4px 9px;border-radius:5px;border:1px solid #d8dee8;background:#fff;
  cursor:pointer;font-size:11px;font-weight:600;color:#475569;margin-right:4px;
  display:inline-flex;align-items:center;gap:4px}
.ee-btn-mini:hover{background:#f8fafc;border-color:#cbd5e1}
.ee-btn-mini-primary{background:#1f6fe5;color:#fff;border-color:#1f6fe5}
.ee-btn-mini-primary:hover{background:#1558c9;color:#fff}
.ee-lt-filter-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;
  background:#fff;border:1px solid #e6e9ef;border-radius:9px;padding:12px 14px;margin-bottom:18px}
.ee-lt-filter-bar .ee-select{min-width:170px}
.ee-lt-clear{margin-left:auto;font-size:12px;padding:7px 16px}
.ee-lt-empty-row td{text-align:center;color:#94a3b8;padding:22px}
.ee-chart-mini{height:230px}


/* Salary payout table scroll */
.ee-scroll-x{overflow-x:auto;border-radius:9px;border:1px solid #e6e9ef;background:#fff}
.ee-scroll-x .ee-table{border:none;border-radius:0}
.ee-filter-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;
  background:#fff;border-bottom:1px solid #e6e9ef;padding:12px 22px}
.ee-filter-bar .ee-select{min-width:170px}
.ee-filter-bar.hide{display:none}
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
                    <div class="ee-search-box">
                        <input type="text" class="ee-input" id="ee-search"
                            placeholder="Search by Name, ID or QID..." autocomplete="off">
                        <button class="ee-search-clear" id="ee-search-clear" title="Clear">&times;</button>
                    </div>
                    <button class="ee-btn ee-btn-dark" id="ee-search-btn">Search</button>
                </div>
            </div>
            <div class="ee-filter-bar hide" id="ee-filter-bar">
                <select class="ee-select" id="ee-filter-company">
                    <option value="">All Companies</option>
                </select>
                <select class="ee-select" id="ee-filter-status">
                    <option value="">All Status</option>
                </select>
                <select class="ee-select" id="ee-filter-etype">
                    <option value="">All Employment Types</option>
                </select>
                <button class="ee-btn ee-btn-dark" id="ee-filter-clear"
                    style="margin-left:auto;font-size:12px;padding:7px 16px">
                    Clear Filters
                </button>
            </div>
            <div class="ee-body" id="ee-body">
                <div class="ee-loading">Loading employees…</div>
            </div>
        </div>
    `);
		this.$body = this.$wrap.find("#ee-body");
	}
	load_filter_options() {
		frappe.call({
			method: "hrcustomization_synergy.hrcustomization_synergy.page.employee_explorer.employee_explorer.get_employee_filter_options",
		}).then((r) => {
			if (!r.message) return;
			const o = r.message;

			const fill = (sel, items, defLabel) => {
				const $s = this.$wrap.find(sel);
				$s.html(`<option value="">${defLabel}</option>` +
					(items || []).map((v) =>
						`<option value="${frappe.utils.escape_html(v)}">${frappe.utils.escape_html(v)}</option>`
					).join(""));
			};

			fill("#ee-filter-company", o.companies, "All Companies");
			fill("#ee-filter-status", o.statuses, "All Status");
			fill("#ee-filter-etype", o.employment_types, "All Employment Types");
		});
	}
	bind_events() {
		const $wrap = this.$wrap;
		$wrap.on("click", "#ee-search-btn", () => this.do_search());
		$wrap.on("keydown", "#ee-search", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.close_dropdown();
				this.do_search();
			}
			if (e.key === "Escape") this.close_dropdown();
		});
		// filters
		$wrap.on("change", "#ee-filter-company", (e) => {
			this.state.company = e.target.value;
			this.load_employees();
		});
		$wrap.on("change", "#ee-filter-status", (e) => {
			this.state.status = e.target.value;
			this.load_employees();
		});
		$wrap.on("change", "#ee-filter-etype", (e) => {
			this.state.employment_type = e.target.value;
			this.load_employees();
		});
		$wrap.on("click", "#ee-filter-clear", () => {
			this.state.company = "";
			this.state.status = "";
			this.state.employment_type = "";
			$wrap.find("#ee-filter-company").val("");
			$wrap.find("#ee-filter-status").val("");
			$wrap.find("#ee-filter-etype").val("");
			this.load_employees();
		});
		$wrap.on("input", "#ee-search", (e) => {
			const val = $(e.currentTarget).val();
			$wrap.find("#ee-search-clear").toggleClass("show", !!val);
			clearTimeout(this._search_timer);
			this._search_timer = setTimeout(() => this.live_search(val), 250);
		});
		$wrap.on("click", "#ee-search-clear", () => {
			$wrap.find("#ee-search").val("").focus();
			$wrap.find("#ee-search-clear").removeClass("show");
			this.close_dropdown();
			this.state.search = "";
			this.load_employees();
		});
		$wrap.on("click", "#ee-back", () => this.show_list());
		$wrap.on("click", ".ee-emp-card", (e) => {
			const emp = $(e.currentTarget).data("name");
			if (emp) this.open_profile(emp);
		});
		$wrap.on("click", ".ee-dropdown-item", (e) => {
			const emp = $(e.currentTarget).data("name");
			this.close_dropdown();
			$wrap.find("#ee-search").val("");
			$wrap.find("#ee-search-clear").removeClass("show");
			if (emp) this.open_profile(emp);
		});
		// close dropdown when clicking outside
		$(document).on("click.ee", (e) => {
			if (!$(e.target).closest(".ee-search-box").length) this.close_dropdown();
		});
		// tabs
		$wrap.on("click", ".ee-tab", (e) => {
			const tab = $(e.currentTarget).data("tab");
			$wrap.find(".ee-tab").removeClass("active");
			$(e.currentTarget).addClass("active");
			$wrap.find(".ee-tab-panel").addClass("hide");
			$wrap.find(`#tab-${tab}`).removeClass("hide");
		});
		// leave history filters
		$wrap.on("change", "#ee-lh-type, #ee-lh-year", () => this.apply_leave_filter());
		// Letters actions
		$wrap.on("click", ".ee-letter-act", (e) => {
			const btn = e.currentTarget;
			const action = $(btn).data("action");
			const doctype = $(btn).data("doctype");
			const name = $(btn).data("name");

			if (action === "view") {
				window.open(
					`/app/${frappe.router.slug(doctype)}/${encodeURIComponent(name)}`,
					"_blank"
				);
				return;
			}

			frappe.call({
				method: "hrcustomization_synergy.api.letters_dashboard.get_print_url",
				args: { doctype, docname: name, preview: action === "preview" ? 1 : 0 },
				callback: (r) => {
					if (r.message && r.message.url) {
						window.open(r.message.url, "_blank");
					} else {
						frappe.msgprint(__("No print format mapped for this document."));
					}
				},
			});
		});
		// Letters tab filters
		$wrap.on("change", "#ee-lt-doctype", (e) => {
			this._lt_doctype = e.target.value;
			this.reload_letters();
		});
		$wrap.on("change", "#ee-lt-type", (e) => {
			this._lt_type = e.target.value;
			this.reload_letters();
		});
		$wrap.on("change", "#ee-lt-status", (e) => {
			this._lt_status = e.target.value;
			this.reload_letters();
		});
		$wrap.on("click", "#ee-lt-clear", () => {
			this._lt_doctype = "";
			this._lt_type = "";
			this._lt_status = "";
			this.reload_letters();
		});
		// Letter actions (View / Preview / Print)
		$wrap.on("click", ".ee-letter-act", (e) => {
			const btn = e.currentTarget;
			const action = $(btn).data("action");
			const doctype = $(btn).data("doctype");
			const name = $(btn).data("name");

			if (action === "view") {
				window.open(`/app/${frappe.router.slug(doctype)}/${encodeURIComponent(name)}`, "_blank");
				return;
			}
			frappe.call({
				method: "hrcustomization_synergy.api.letters_dashboard.get_print_url",
				args: { doctype, docname: name, preview: action === "preview" ? 1 : 0 },
				callback: (r) => {
					if (r.message && r.message.url) window.open(r.message.url, "_blank");
					else frappe.msgprint(__("No print format mapped for this document."));
				},
			});
		});
	}

	/* ---------------- LIVE SEARCH DROPDOWN ---------------- */
	live_search(q) {
		q = (q || "").trim();
		if (q.length < 1) {
			this.close_dropdown();
			return;
		}
		frappe.call({
			method: "hrcustomization_synergy.hrcustomization_synergy.page.employee_explorer.employee_explorer.get_employees",
			args: { search: q, limit: 20 },
		}).then((r) => {
			const list = r.message || [];
			this.render_dropdown(list, q);
		});
	}

	render_dropdown(list, q) {
		const $dd = this.$wrap.find(".ee-dropdown");
		if (!$dd.length) {
			this.$wrap.find(".ee-search-box").append(`<div class="ee-dropdown"></div>`);
		}
		const $d = this.$wrap.find(".ee-dropdown");

		if (!list.length) {
			$d.html(`<div class="ee-dropdown-empty">No employee matching "<b>${frappe.utils.escape_html(q)}</b>"</div>`)
				.addClass("show");
			return;
		}

		$d.html(list.map((e) => {
			const av = e.image ? `<img src="${e.image}">` : `<i class="fa fa-user"></i>`;
			return `
			<div class="ee-dropdown-item" data-name="${frappe.utils.escape_html(e.name)}">
				<div class="av">${av}</div>
				<div class="body">
					<div class="nm">${frappe.utils.escape_html(e.employee_name || e.name)}</div>
					<div class="sb">
						${frappe.utils.escape_html(e.designation || "-")} •
						${frappe.utils.escape_html(e.employee_number || e.name)}
						${e.custom_qid_number ? " • QID " + frappe.utils.escape_html(e.custom_qid_number) : ""}
					</div>
				</div>
			</div>`;
		}).join("")).addClass("show");
	}

	close_dropdown() {
		this.$wrap.find(".ee-dropdown").removeClass("show");
	}

	do_search() {
		this.state.search = this.$wrap.find("#ee-search").val() || "";
		this.close_dropdown();
		this.load_employees();
	}

	/* ---------------- LIST ---------------- */
	load_employees() {
		this.$body.html(`<div class="ee-loading">Loading employees…</div>`);

		Promise.all([
			frappe.call({
				method: "hrcustomization_synergy.hrcustomization_synergy.page.employee_explorer.employee_explorer.get_employees",
				args: {
					search: this.state.search || null,
					company: this.state.company || null,
					status: this.state.status || null,
					employment_type: this.state.employment_type || null,
				},
			}),
			this.load_dashboard(),   // 👈 dono ek saath chalao
		]).then(([r]) => {
			this.employees = r.message || [];
			this.render_list();
		});
	}

	load_dashboard() {
		return frappe.call({
			method: "hrcustomization_synergy.hrcustomization_synergy.page.employee_explorer.employee_explorer.get_dashboard",
			args: {
				search: this.state.search || null,
				company: this.state.company || null,
				status: this.state.status || null,
				employment_type: this.state.employment_type || null,
			},
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
		this.$wrap.find("#ee-filter-bar").removeClass("hide");

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
			$g.html(`<div class="ee-empty">No employee found for selected filters.</div>`);
			return;
		}

		$g.html(this.employees.map((e) => {
			const av = e.image ? `<img src="${e.image}">` : `<i class="fa fa-user"></i>`;
			return `
        <div class="ee-emp-card" data-name="${frappe.utils.escape_html(e.name)}">
            <div class="ee-avatar">${av}</div>
            <div class="ee-emp-body">
                <div class="ee-emp-name">${frappe.utils.escape_html(e.employee_name || e.name)}</div>
                <div class="ee-emp-sub">${frappe.utils.escape_html(e.designation || "-")}</div>
                <div class="ee-emp-meta">
                    ${frappe.utils.escape_html(e.department || "-")} •
                    ${frappe.utils.escape_html(e.employee_number || e.name)}
                    ${e.company ? " • " + frappe.utils.escape_html(e.company) : ""}
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

	open_profile(employee) {
		this.$body.html(`<div class="ee-loading">Loading profile…</div>`);
		this.$wrap.find("#ee-back").removeClass("hide");
		this.$wrap.find("#ee-search-wrap").addClass("hide");
		this.$wrap.find("#ee-filter-bar").addClass("hide");
		// reset letters filter state
		this._lt_doctype = "";
		this._lt_type = "";
		this._lt_status = "";

		Promise.all([
			this._call("get_employee_profile", { employee }),
			this._call("get_employee_salary_slips", { employee, limit: 100 }),
			this._call("get_employee_letters", { employee }),
		]).then(([profile, slips, letters]) => {
			if (!profile) return;
			this.employee = employee;
			this.profile = profile;
			this.salary_slips = slips || [];
			this.letters = letters || { rows: [], has_letters: false, count: 0 };
			this.$wrap.find("#ee-title").text(profile.employee.employee_name || employee);
			this.render_profile(profile);
		});
	}

	_call(method, args) {
		return frappe.call({
			method: `hrcustomization_synergy.hrcustomization_synergy.page.employee_explorer.employee_explorer.${method}`,
			args: args,
		}).then((r) => r.message);
	}

	show_list() {
		this.render_list();
		this.load_dashboard();
	}

	render_profile(p) {
		const e = p.employee || {};
		const avatar = e.image ? `<img src="${e.image}">` : `<i class="fa fa-user"></i>`;

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
			<!-- HEADER CARD -->
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

			<!-- TABS -->
			<div class="ee-tabs">
				<button class="ee-tab active" data-tab="identification">
					<i class="fa fa-id-card-o"></i> Identification Details
				</button>
				<button class="ee-tab" data-tab="salary">
					<i class="fa fa-money"></i> Salary Payout
				</button>
				${(this.letters && this.letters.has_letters) ? `
				<button class="ee-tab" data-tab="letters">
					<i class="fa fa-envelope-o"></i> Letters
					<span style="background:#e2e8f0;color:#475569;font-size:10px;font-weight:700;
						padding:1px 7px;border-radius:10px;margin-left:4px">${this.letters.count}</span>
				</button>` : ""}
			</div>

			<!-- TAB 1: IDENTIFICATION DETAILS -->
			<div class="ee-tab-panel" id="tab-identification">

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

					<div>
						<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px;margin-bottom:8px">LEAVE BALANCES</div>
						<table class="ee-table">
							<thead>
								<tr>
									<th>Leave Type</th>
									<th style="text-align:right">Eligible</th>
									<th style="text-align:right">Utilized</th>
									<th style="text-align:right">Balance</th>
								</tr>
							</thead>
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

					<div style="margin-top:20px">
						<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:10px">
							<div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px">LEAVE HISTORY</div>
							<div class="ee-filter-row" style="margin:0">
								<select class="ee-select" id="ee-lh-type">
									<option value="">All Leave Types</option>
								</select>
								<select class="ee-select" id="ee-lh-year">
									<option value="">All Years</option>
								</select>
							</div>
						</div>
						<div id="ee-lh-table"></div>
					</div>
				</div>

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

				<div class="ee-sec">
					${p.salary.components.length ? `
						<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
							<h3 class="ee-sec-title" style="margin:0">
								<i class="fa fa-money"></i> Salary &amp; Benefits (Current)
							</h3>
							<div style="font-size:12px;color:#64748b">
 								<span style="color:#94a3b8">Effective From:</span>
								<b style="color:#334155">${this.d(p.salary.from_date)}</b>
							</div>
						</div>
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
					` : `
						<h3 class="ee-sec-title"><i class="fa fa-money"></i> Salary &amp; Benefits (Current)</h3>
						<div class="ee-empty">No salary structure assigned.</div>
					`}
				</div>

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
			</div>

            <!-- TAB 2: SALARY PAYOUT -->
            <div class="ee-tab-panel hide" id="tab-salary">
                <div class="ee-sec">
                    <h3 class="ee-sec-title"><i class="fa fa-money"></i> Salary Payout
                        <span style="color:#94a3b8;font-weight:500;font-size:13px">
                            (${this.salary_slips.length})</span>
                    </h3>
                    ${this.render_salary_payout(this.salary_slips)}
                </div>
            </div>

            <!-- TAB 3: LETTERS (only if letters exist) -->
            ${(this.letters && this.letters.has_letters) ? `
            <div class="ee-tab-panel hide" id="tab-letters">
                <div class="ee-sec">
                    <h3 class="ee-sec-title">
                        <i class="fa fa-envelope-o"></i> Letters
                        <span style="color:#94a3b8;font-weight:500;font-size:13px">
                            (${this.letters.count})</span>
                    </h3>
                    ${this.render_letters_table(this.letters.rows)}
                </div>
            </div>` : ""}
		`);

		// render leave history + populate filters
		this.render_leave_history(p.leave.history || []);
		// render letters panel if present
		if (this.letters && this.letters.has_letters) {
			this.render_letters_panel();
		}
	}


	/* ---------------- LETTERS PANEL ---------------- */
	render_letters_panel() {
		const L = this.letters || {};
		const $tab = this.$body.find("#tab-letters");
		if (!$tab.length) return;

		$tab.html(`
        <div class="ee-sec">
            <h3 class="ee-sec-title">
                <i class="fa fa-envelope-o"></i> Letters
                <span style="color:#94a3b8;font-weight:500;font-size:13px">
                    (${L.count} of ${L.total_count})</span>
            </h3>
            ${this._letters_cards_html(L)}
            ${this._letters_filter_html(L)}
            ${this._letters_charts_html()}
            ${this.render_letters_table(L.rows)}
        </div>
    `);

		// draw charts after DOM insert
		setTimeout(() => this.draw_letter_charts(), 60);
	}

	_letters_cards_html(L) {
		const k = L.kpis || {};
		return `
        <div class="ee-grid-cards" style="margin-bottom:18px">
            <div class="ee-stat">
                <div class="lbl">Total Letters</div>
                <div class="val">${k.total || 0}</div>
            </div>
            <div class="ee-stat" style="border-left-color:#8c99a6">
                <div class="lbl">Approved</div>
                <div class="val">${k.approved || 0}</div>
            </div>
            <div class="ee-stat" style="border-left-color:#eda100">
                <div class="lbl">Draft</div>
                <div class="val">${k.draft || 0}</div>
            </div>
            <div class="ee-stat" style="border-left-color:#f97316">
                <div class="lbl">Pending</div>
                <div class="val">${k.pending || 0}</div>
            </div>
            <div class="ee-stat" style="border-left-color:#e34948">
                <div class="lbl">Rejected</div>
                <div class="val">${k.rejected || 0}</div>
            </div>
        </div>
    `;
	}

	_letters_filter_html(L) {
		const o = L.options || {};
		const cur_dt = this._lt_doctype || "";
		const cur_t = this._lt_type || "";
		const cur_s = this._lt_status || "";

		const dtOpts = (o.doctypes || []).map((d) =>
			`<option value="${frappe.utils.escape_html(d)}" ${cur_dt === d ? "selected" : ""}>${frappe.utils.escape_html(d)}</option>`
		).join("");
		const tOpts = (o.types || []).map((t) =>
			`<option value="${frappe.utils.escape_html(t)}" ${cur_t === t ? "selected" : ""}>${frappe.utils.escape_html(t)}</option>`
		).join("");
		const sOpts = (o.statuses || []).map((s) =>
			`<option value="${frappe.utils.escape_html(s)}" ${cur_s === s ? "selected" : ""}>${frappe.utils.escape_html(s)}</option>`
		).join("");

		return `
        <div class="ee-lt-filter-bar">
            <select class="ee-select" id="ee-lt-doctype">
                <option value="">All Doc Types</option>${dtOpts}
            </select>
            <select class="ee-select" id="ee-lt-type">
                <option value="">All Letter Types</option>${tOpts}
            </select>
            <select class="ee-select" id="ee-lt-status">
                <option value="">All Status</option>${sOpts}
            </select>
            <button class="ee-btn ee-btn-dark ee-lt-clear" id="ee-lt-clear">Clear</button>
        </div>
    `;
	}

	_letters_charts_html() {
		return `
        <div class="ee-charts" style="margin-bottom:22px">
            <div class="ee-panel">
                <h4>By Status</h4>
                <div id="ee-chart-letter-status" class="ee-chart-mini"></div>
            </div>
            <div class="ee-panel">
                <h4>By Letter Type</h4>
                <div id="ee-chart-letter-type" class="ee-chart-mini"></div>
            </div>
        </div>
    `;
	}

	draw_letter_charts() {
		const L = this.letters || {};
		if (!L.charts) return;

		// destroy old
		if (this._lt_chart_status) { try { this._lt_chart_status.destroy(); } catch (e) { } }
		if (this._lt_chart_type) { try { this._lt_chart_type.destroy(); } catch (e) { } }

		// ---------- Status color map (match screenshot) ----------
		const STATUS_COLORS = {
			"Approved": "#8c99a6",
			"Draft": "#eda100",
			"CEO Approval": "#199e70",
			"SSD Approval": "#e34948",
			"Rejected": "#e34948",
			"Pending": "#f97316",
		};
		const FALLBACK = ["#2a78d6", "#8b5cf6", "#06b6d4", "#10b981", "#ef4444", "#f59e0b"];

		// ---------- Donut: By Status ----------
		const st = L.charts.by_status || { labels: [], data: [] };
		const stColors = st.labels.map((lbl, i) => STATUS_COLORS[lbl] || FALLBACK[i % FALLBACK.length]);

		const elStatus = this.$body.find("#ee-chart-letter-status")[0];
		if (elStatus) {
			if (typeof frappe.Chart === "function") {
				this._lt_chart_status = new frappe.Chart(elStatus, {
					type: "donut",
					data: { labels: st.labels, datasets: [{ values: st.data }] },
					colors: stColors,
					height: 230,
				});
			} else {
				elStatus.innerHTML = this._fallback_bars(st.labels, st.data, stColors);
			}
		}

		// ---------- Bar: By Type ----------
		const tp = L.charts.by_type || { labels: [], data: [] };
		const elType = this.$body.find("#ee-chart-letter-type")[0];
		if (elType) {
			if (typeof frappe.Chart === "function") {
				this._lt_chart_type = new frappe.Chart(elType, {
					type: "bar",
					data: { labels: tp.labels, datasets: [{ values: tp.data }] },
					colors: ["#2a78d6"],
					height: 230,
					axisOptions: { xAxisMode: "tick" },
				});
			} else {
				elType.innerHTML = this._fallback_bars(tp.labels, tp.data, ["#2a78d6"]);
			}
		}
	}

	_fallback_bars(labels, values, colors) {
		if (!labels.length) return `<div class="ee-empty" style="border:none">No data</div>`;
		const max = Math.max(...values, 1);
		return labels.map((l, i) => {
			const col = colors[i % colors.length];
			return `
        <div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#475569">
                <span>${frappe.utils.escape_html(l)}</span><b>${values[i]}</b></div>
            <div style="height:7px;background:#eef2f7;border-radius:4px;margin-top:3px">
                <div style="width:${(values[i] / max) * 100}%;height:100%;background:${col};border-radius:4px"></div>
            </div>
        </div>`;
		}).join("");
	}

	reload_letters() {
		if (!this.employee) return;
		const $tab = this.$body.find("#tab-letters");
		$tab.html(`<div class="ee-loading">Loading letters…</div>`);

		this._call("get_employee_letters", {
			employee: this.employee,
			doctype_filter: this._lt_doctype || null,
			type_filter: this._lt_type || null,
			status_filter: this._lt_status || null,
		}).then((res) => {
			if (!res) return;
			// keep full option list (from backend unfiltered) — overwrite only rows/counts
			this.letters = res;
			// re-render whole profile tab (so badge + tab count update too)
			this.render_letters_panel();
			// update tab badge
			this.$body.find('[data-tab="letters"] span').text(this.letters.count);
		});
	}

	/* ---------------- LETTERS TABLE ---------------- */
	render_letters_table(rows) {
		if (!rows || !rows.length) {
			return `<div class="ee-empty">No letters found for selected filters.</div>`;
		}

		const body = rows.map((r) => `
        <tr>
            <td><b>${frappe.utils.escape_html(r.name)}</b></td>
            <td>${frappe.utils.escape_html(r.doctype)}</td>
            <td>${frappe.utils.escape_html(r.type || "-")}</td>
            <td>${this.letters_status_badge(r.status)}</td>
            <td>${this.d(r.creation ? String(r.creation).slice(0, 10) : null)}</td>
            <td>
                <button class="ee-btn-mini ee-letter-act" data-action="view"
                    data-doctype="${frappe.utils.escape_html(r.doctype)}"
                    data-name="${frappe.utils.escape_html(r.name)}">
                    <i class="fa fa-external-link"></i> View
                </button>
                <button class="ee-btn-mini ee-letter-act" data-action="preview"
                    data-doctype="${frappe.utils.escape_html(r.doctype)}"
                    data-name="${frappe.utils.escape_html(r.name)}">
                    <i class="fa fa-eye"></i> Preview
                </button>
                ${(r.status === "Approved") ? `
                <button class="ee-btn-mini ee-btn-mini-primary ee-letter-act" data-action="print"
                    data-doctype="${frappe.utils.escape_html(r.doctype)}"
                    data-name="${frappe.utils.escape_html(r.name)}">
                    <i class="fa fa-print"></i> Print
                </button>` : ""}
            </td>
        </tr>`).join("");

		return `
        <div class="ee-scroll-x">
            <table class="ee-table">
                <thead>
                    <tr>
                        <th>Reference</th>
                        <th>Doc Type</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>`;
	}

	letters_status_badge(status) {
		const s = (status || "").toLowerCase();
		if (s === "approved") return `<span class="ee-pill ee-pill-green">Approved</span>`;
		if (s === "rejected") return `<span class="ee-pill ee-pill-red">Rejected</span>`;
		if (s === "draft") return `<span class="ee-pill ee-pill-grey">Draft</span>`;
		return `<span class="ee-pill" style="background:#fef3c7;color:#b45309">
        ${frappe.utils.escape_html(status || "-")}</span>`;
	}


	/* ---------------- SALARY PAYOUT ---------------- */
	render_salary_payout(slips) {
		if (!slips.length) {
			return `<div class="ee-empty">No salary slips found for this employee.</div>`;
		}

		// ---------- Summary cards compute ----------
		const total_slips = slips.length;

		let total_earnings = 0;
		let total_deductions = 0;
		let total_net = 0;
		let total_days = 0;

		slips.forEach((s) => {
			total_earnings += flt(s.gross_pay);
			total_deductions += flt(s.total_deduction);
			total_net += flt(s.net_pay);
			total_days += flt(s.payment_days);
		});

		const last = slips[0];
		const avg_net = total_net / total_slips;
		const last_basic = this._amt(last, "Basic Salary");

		// ---------- Cards ----------
		const cards = `
        <div class="ee-grid-cards" style="margin-bottom:22px">
            <div class="ee-stat">
                <div class="lbl">Total Salary Slips</div>
                <div class="val">${total_slips}</div>
            </div>
            <div class="ee-stat" style="border-left-color:#22c55e">
                <div class="lbl">Total Earnings</div>
                <div class="val">${this.money(total_earnings)}</div>
            </div>
            <div class="ee-stat" style="border-left-color:#ef4444">
                <div class="lbl">Total Deductions</div>
                <div class="val">${this.money(total_deductions)}</div>
            </div>
            <div class="ee-stat" style="border-left-color:#06b6d4">
                <div class="lbl">Total Net Pay</div>
                <div class="val">${this.money(total_net)}</div>
            </div>
        </div>

        <div class="ee-grid-cards" style="margin-bottom:22px">
            <div class="ee-stat" style="border-left-color:#8b5cf6">
                <div class="lbl">Last Net Pay</div>
                <div class="val">${this.money(last.net_pay)}</div>
                <div style="font-size:11px;color:#94a3b8;margin-top:4px">
                    ${this.d(last.start_date)} → ${this.d(last.end_date)}
                </div>
            </div>
            <div class="ee-stat" style="border-left-color:#f59e0b">
                <div class="lbl">Average Net Pay</div>
                <div class="val">${this.money(avg_net)}</div>
            </div>
            <div class="ee-stat" style="border-left-color:#0ea5e9">
                <div class="lbl">Total Paid Days</div>
                <div class="val">${this.n(total_days)}</div>
            </div>
            <div class="ee-stat" style="border-left-color:#10b981">
                <div class="lbl">Last Basic Salary</div>
                <div class="val">${this.money(last_basic)}</div>
            </div>
        </div>
    `;

		// ---------- Helper: get component amount per slip ----------
		const comp = (s, name) => this._amt(s, name);

		// ---------- Table rows (Bank Name & Account No REMOVED) ----------
		const rows = slips.map((s) => `
        <tr>
            <td><b>${frappe.utils.escape_html(s.name)}</b></td>
            <td>${frappe.utils.escape_html(s.employee || "-")}</td>
            <td>${frappe.utils.escape_html(s.employee_name || "-")}</td>
            <td>${frappe.utils.escape_html(s.employee_number || "-")}</td>
            <td>${frappe.utils.escape_html(s.gender || "-")}</td>
            <td>${frappe.utils.escape_html(s.nationality || "-")}</td>
            <td>${frappe.utils.escape_html(s.marital_status || "-")}</td>
            <td>${frappe.utils.escape_html(s.company || "-")}</td>
            <td>${frappe.utils.escape_html(s.department || "-")}</td>
            <td>${frappe.utils.escape_html(s.designation || "-")}</td>
            <td>${this.d(s.posting_date)}</td>
            <td>${this.d(s.start_date)}</td>
            <td>${this.d(s.end_date)}</td>
            <td style="text-align:right">${flt(s.payment_days)}</td>
            <td style="text-align:right">${this.money(comp(s, "Basic Salary"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Housing Allowance"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Other Allowance"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Transport Allowance"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Ticket Allowance"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Leave Salary"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Advance Salary Paid"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Overtime"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Bonus"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Sales Commission"))}</td>
            <td style="text-align:right">${this.money(comp(s, "Sales Tips"))}</td>
            <td style="text-align:right"><b>${this.money(s.gross_pay)}</b></td>
            <td style="text-align:right;color:#b91c1c">${this.money(s.total_deduction)}</td>
            <td style="text-align:right"><b style="color:#15803d">${this.money(s.net_pay)}</b></td>
            <td style="text-align:right">${this.money(s.year_to_date)}</td>
        </tr>`).join("");

		const table = `
        <div class="ee-scroll-x">
            <table class="ee-table">
                <thead>
                    <tr>
                        <th>Salary Slip</th>
                        <th>Employee</th>
                        <th>Employee Name</th>
                        <th>Employee ID</th>
                        <th>Gender</th>
                        <th>Nationality</th>
                        <th>Marital Status</th>
                        <th>Company</th>
                        <th>Department</th>
                        <th>Designation</th>
                        <th>Posting Date</th>
                        <th>Start Date</th>
                        <th>End Date</th>
                        <th style="text-align:right">Payment Days</th>
                        <th style="text-align:right">Basic Salary</th>
                        <th style="text-align:right">Housing Allowance</th>
                        <th style="text-align:right">Other Allowance</th>
                        <th style="text-align:right">Transport Allowance</th>
                        <th style="text-align:right">Ticket Allowance</th>
                        <th style="text-align:right">Leave Salary</th>
                        <th style="text-align:right">Advance Salary Paid</th>
                        <th style="text-align:right">Overtime</th>
                        <th style="text-align:right">Bonus</th>
                        <th style="text-align:right">Sales Commission</th>
                        <th style="text-align:right">Sales Tips</th>
                        <th style="text-align:right">Total Salary</th>
                        <th style="text-align:right">Total Deductions</th>
                        <th style="text-align:right">Net Pay</th>
                        <th style="text-align:right">Year To Date</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;

		return cards + table;
	}
	/* ---------------- LETTERS TABLE ---------------- */
	render_letters_table(rows) {
		if (!rows || !rows.length) {
			return `<div class="ee-empty">No letters found for this employee.</div>`;
		}

		const body = rows.map((r) => `
        <tr>
            <td><b>${frappe.utils.escape_html(r.name)}</b></td>
            <td>${frappe.utils.escape_html(r.doctype)}</td>
            <td>${frappe.utils.escape_html(r.type || "-")}</td>
            <td>${this.letters_status_badge(r.status)}</td>
            <td>${this.d(r.creation ? String(r.creation).slice(0, 10) : null)}</td>
            <td>
                <button class="ee-btn-mini ee-letter-act"
                    data-action="view"
                    data-doctype="${frappe.utils.escape_html(r.doctype)}"
                    data-name="${frappe.utils.escape_html(r.name)}">
                    <i class="fa fa-external-link"></i> View
                </button>
                <button class="ee-btn-mini ee-letter-act"
                    data-action="preview"
                    data-doctype="${frappe.utils.escape_html(r.doctype)}"
                    data-name="${frappe.utils.escape_html(r.name)}">
                    <i class="fa fa-eye"></i> Preview
                </button>
                ${(r.status === "Approved") ? `
                <button class="ee-btn-mini ee-btn-mini-primary ee-letter-act"
                    data-action="print"
                    data-doctype="${frappe.utils.escape_html(r.doctype)}"
                    data-name="${frappe.utils.escape_html(r.name)}">
                    <i class="fa fa-print"></i> Print
                </button>` : ""}
            </td>
        </tr>`).join("");

		return `
        <div class="ee-scroll-x">
            <table class="ee-table">
                <thead>
                    <tr>
                        <th>Reference</th>
                        <th>Doc Type</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>`;
	}

	letters_status_badge(status) {
		const s = (status || "").toLowerCase();
		if (s === "approved") return `<span class="ee-pill ee-pill-green">Approved</span>`;
		if (s === "rejected") return `<span class="ee-pill ee-pill-red">Rejected</span>`;
		if (s === "draft") return `<span class="ee-pill ee-pill-grey">Draft</span>`;
		return `<span class="ee-pill" style="background:#fef3c7;color:#b45309">
        ${frappe.utils.escape_html(status || "-")}</span>`;
	}
	/* ---------------- LEAVE HISTORY (with filters) ---------------- */
	render_leave_history(history) {
		this._leave_history = history || [];

		// populate Leave Type options
		const types = [...new Set(this._leave_history.map((h) => h.leave_type).filter(Boolean))].sort();
		const $t = this.$body.find("#ee-lh-type");
		$t.html(`<option value="">All Leave Types</option>` +
			types.map((t) => `<option value="${frappe.utils.escape_html(t)}">${frappe.utils.escape_html(t)}</option>`).join(""));

		// populate Years
		const years = [...new Set(this._leave_history.map((h) =>
			h.from_date ? String(h.from_date).slice(0, 4) : null
		).filter(Boolean))].sort().reverse();
		const $y = this.$body.find("#ee-lh-year");
		$y.html(`<option value="">All Years</option>` +
			years.map((y) => `<option value="${y}">${y}</option>`).join(""));

		this.apply_leave_filter();
	}

	apply_leave_filter() {
		const type = this.$body.find("#ee-lh-type").val();
		const year = this.$body.find("#ee-lh-year").val();

		let rows = this._leave_history || [];
		if (type) rows = rows.filter((h) => h.leave_type === type);
		if (year) rows = rows.filter((h) => String(h.from_date || "").slice(0, 4) === year);

		const $c = this.$body.find("#ee-lh-table");
		if (!rows.length) {
			$c.html(`<div class="ee-empty">No leave history found for selected filter.</div>`);
			return;
		}

		$c.html(`
			<table class="ee-table">
				<thead><tr>
					<th>Leave Type</th><th>From</th><th>To</th>
					<th style="text-align:right">Days</th><th>Status</th>
				</tr></thead>
				<tbody>
					${rows.map((h) => `
						<tr>
							<td>${frappe.utils.escape_html(h.leave_type)}</td>
							<td>${this.d(h.from_date)}</td>
							<td>${this.d(h.to_date)}</td>
							<td style="text-align:right">${this.n(h.total_leave_days)}</td>
							<td>${frappe.utils.escape_html(h.status)}</td>
						</tr>`).join("")}
				</tbody>
			</table>`);
	}

	/* ---------------- small helpers ---------------- */
	status_badge(status) {
		const s = (status || "").toLowerCase();
		if (s === "active") return `<span class="ee-pill ee-pill-green">Active</span>`;
		if (s === "left") return `<span class="ee-pill ee-pill-red">Left</span>`;
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
	_amt(slip, component_name) {
		const c = (slip.components || []).find(
			(x) => x.salary_component === component_name && x.parentfield === "earnings"
		);
		return c ? flt(c.amount) : 0;
	}
}