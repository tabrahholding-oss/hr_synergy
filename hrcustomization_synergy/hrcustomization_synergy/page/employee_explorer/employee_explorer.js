/* ============================================================
 * HR Dashboard  –  Desk Page (v5)
 * ============================================================ */

frappe.pages["employee-explorer"].on_page_load = function (wrapper) {
	const roles = frappe.user_roles || [];
	const allowed = ["Employee Explorer User", "System Manager"];
	if (!allowed.some(r => roles.includes(r))) {
		frappe.msgprint({
			title: __("Access Denied"),
			indicator: "red",
			message: __("Aap ko HR Dashboard access karne ki ijazat nahi hai."),
		});
		setTimeout(() => frappe.set_route("app"), 1500);
		return;
	}

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("HR Dashboard"),
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
			status: "Active",
			employment_type: "",
		};
		this._search_timer = null;
		this._filter_options_loaded = false;

		// Top main tab
		this._active_mtab = "employees";

		// HR tab state
		this._hr_month = "";
		this._hr_year = "";
		this._hr_company = "";

		// Letters filter state
		this._lt_doctype = "";
		this._lt_type = "";
		this._lt_status = "";

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
.ee-back.hide{display:none}
.ee-title{color:#1f6fe5;font-size:22px;font-weight:700;margin:0;display:inline-block}
.ee-search-wrap{display:flex;gap:8px;position:relative}
.ee-search-wrap.hide{display:none}
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

/* TOP MAIN TABS */
.ee-main-tabs{display:flex;gap:0;border-bottom:2px solid #e6e9ef;margin-bottom:-2px}
.ee-main-tabs.hide{display:none}
.ee-main-tab{background:transparent;border:none;padding:8px 22px;font-size:15px;font-weight:700;
  color:#64748b;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;transition:.15s}
.ee-main-tab:hover{color:#1f6fe5}
.ee-main-tab.active{color:#1f6fe5;border-bottom-color:#1f6fe5}

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

.ee-scroll-x{overflow-x:auto;border-radius:9px;border:1px solid #e6e9ef;background:#fff}
.ee-scroll-x .ee-table{border:none;border-radius:0}
.ee-filter-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;
  background:#fff;border-bottom:1px solid #e6e9ef;padding:12px 22px}
.ee-filter-bar .ee-select{min-width:170px}
.ee-filter-bar.hide{display:none}

/* ============ HR DETAIL TAB ============ */
.ee-hr-filter-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;
  background:#fff;border:1px solid #e6e9ef;border-radius:9px;padding:12px 14px;margin-bottom:18px}
.ee-hr-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:20px}
@media(max-width:1200px){.ee-hr-kpis{grid-template-columns:repeat(3,1fr)}}
@media(max-width:700px){.ee-hr-kpis{grid-template-columns:repeat(2,1fr)}}
.ee-hr-kpi{background:#fff;border:1px solid #e6e9ef;border-radius:9px;padding:14px 16px;
  display:flex;gap:12px;align-items:flex-start}
.ee-hr-kpi .ico{width:38px;height:38px;border-radius:8px;display:flex;align-items:center;
  justify-content:center;font-size:16px;flex:0 0 38px}
.ee-hr-kpi .body{flex:1;min-width:0}
.ee-hr-kpi .lbl{font-size:10.5px;font-weight:700;color:#64748b;letter-spacing:.4px;text-transform:uppercase}
.ee-hr-kpi .val{font-size:22px;font-weight:700;color:#0f172a;margin-top:4px}

.ee-hr-charts{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:18px}
@media(max-width:1000px){.ee-hr-charts{grid-template-columns:1fr}}
.ee-hr-panel{background:#fff;border:1px solid #e6e9ef;border-radius:9px;padding:14px 18px}
.ee-hr-panel h4{margin:0 0 14px;font-size:13.5px;font-weight:700;color:#334155}
.ee-hr-panel .chart-wrap{min-height:240px;position:relative}

/* Donut with right legend */
.ee-donut-wrap{display:flex;align-items:center;gap:22px;min-height:220px}
.ee-donut-svg{flex:0 0 180px}
.ee-donut-legend{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;max-height:220px;overflow-y:auto;padding-right:4px}
.ee-dl-item{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#334155}
.ee-dl-item .dot{width:11px;height:11px;border-radius:50%;flex:0 0 11px}
.ee-dl-item .lbl{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ee-dl-item .pct{font-weight:700;color:#0f172a;font-size:12px;flex:0 0 auto}
/* ============ ORGANISATION CHART TAB ============ */
.oc-wrap{
  background:linear-gradient(135deg,#1e3a5f 0%,#0f2540 100%);
  border-radius:12px;padding:22px 14px 28px;overflow:auto;
  min-height:480px;
}
.oc-actions{display:flex;gap:8px;margin-bottom:16px;justify-content:center}
.oc-actions button{
  border:none;padding:6px 14px;border-radius:6px;background:rgba(255,255,255,0.13);
  color:#fff;cursor:pointer;font-size:11.5px;font-weight:600;
  border:1px solid rgba(255,255,255,0.18);
}
.oc-actions button:hover{background:rgba(255,255,255,0.22)}

.oc-tree{padding:6px 0;display:inline-block;min-width:100%;text-align:center}
.oc-tree ul{
  display:flex;justify-content:center;padding:20px 0 0;position:relative;
  margin:0;list-style:none;
}
.oc-tree > ul{padding-top:0}
.oc-tree li{
  list-style:none;position:relative;padding:20px 6px 0;
  display:flex;flex-direction:column;align-items:center;
}
.oc-tree > ul > li{padding-top:0}

/* Connector: horizontal segment going to parent */
.oc-tree li::before,
.oc-tree li::after{
  content:"";position:absolute;top:0;right:50%;width:50%;height:20px;
  border-top:1.5px solid rgba(255,255,255,0.30);
}
.oc-tree li::after{
  right:auto;left:50%;border-left:1.5px solid rgba(255,255,255,0.30);
}
.oc-tree li:only-child::before,
.oc-tree li:only-child::after{display:none}
.oc-tree li:first-child::before,
.oc-tree li:last-child::after{border:0}
.oc-tree li:first-child::after{border-radius:4px 0 0 0}
.oc-tree li:last-child::before{
  border-right:1.5px solid rgba(255,255,255,0.30);
  border-radius:0 4px 0 0;
}
.oc-tree ul ul::before{
  content:"";position:absolute;top:0;left:50%;height:20px;
  border-left:1.5px solid rgba(255,255,255,0.30);
}
.oc-tree > ul > li::before,
.oc-tree > ul > li::after{display:none}

.oc-hidden{display:none !important}

/* ---------- Compact Card ---------- */
.oc-card{
  width:140px;min-height:150px;padding:0 0 22px;
  border-radius:12px;
  background:linear-gradient(180deg,#eaf2fb 0%,#4a90e2 38%,#1e4e97 100%);
  display:flex;flex-direction:column;align-items:center;
  cursor:default;position:relative;
  box-shadow:0 5px 12px rgba(0,0,0,0.28);
  text-align:center;transition:transform .15s,box-shadow .15s;
}
.oc-card.has-children{cursor:pointer}
.oc-card.has-children:hover{transform:translateY(-3px);box-shadow:0 9px 18px rgba(0,0,0,0.40)}

/* Photo */
.oc-photo-wrap{
  width:48px;height:48px;border-radius:50%;background:#fff;
  margin:9px 0 7px;display:flex;align-items:center;justify-content:center;
  overflow:hidden;box-shadow:0 3px 7px rgba(0,0,0,0.20);
  border:2px solid #fff;flex:0 0 48px;
}
.oc-photo-wrap img{width:100%;height:100%;object-fit:cover;display:block}
.oc-photo-wrap i{color:#94a3b8;font-size:20px}

/* Text */
.oc-name{
  font-size:11.5px;font-weight:700;color:#fff;
  padding:0 8px;line-height:1.22;margin-bottom:2px;
  text-shadow:0 1px 2px rgba(0,0,0,0.28);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden;word-break:break-word;max-width:100%;
}
.oc-code{
  font-size:9px;color:rgba(255,255,255,0.88);
  font-weight:700;letter-spacing:.3px;margin-bottom:4px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;
  padding:0 6px;
}
.oc-desig{
  font-size:10px;color:#fff;font-weight:600;
  padding:0 8px;line-height:1.22;margin-bottom:1px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden;word-break:break-word;max-width:100%;
}
.oc-dept{
  font-size:9.5px;color:rgba(255,255,255,0.85);
  padding:0 8px;line-height:1.22;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;
  overflow:hidden;word-break:break-word;max-width:100%;
}

/* Toggle button */
.oc-toggle{
  position:absolute;bottom:5px;left:50%;transform:translateX(-50%);
  width:17px;height:17px;border-radius:50%;
  background:rgba(255,255,255,0.95);color:#1e3a5f;
  font-weight:700;font-size:11px;line-height:1;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 2px 5px rgba(0,0,0,0.22);user-select:none;
}

/* Empty state */
.oc-empty{
  padding:80px 20px;text-align:center;
  color:rgba(255,255,255,0.75);font-size:14px;
}

/* Multiple roots wrapper */
.oc-roots{
  display:flex;justify-content:center;gap:40px;flex-wrap:wrap;
  align-items:flex-start;padding-top:10px;
}
/* Funnel */
.ee-funnel-wrap{padding:6px 0 4px}
`}</style>`).appendTo(document.head);
	}

	/* ---------------- SHELL ---------------- */
	build_shell() {
		this.$wrap.html(`
        <div class="ee-app">
            <div class="ee-topbar">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <span class="ee-back hide" id="ee-back">&larr; Back</span>
                    <div class="ee-main-tabs" id="ee-main-tabs">
                        <button class="ee-main-tab active" data-mtab="employees">Employee Detail</button>
                        <button class="ee-main-tab" data-mtab="hr">HR Detail</button>
                        <button class="ee-main-tab" data-mtab="org_chart">Organisation Chart</button>
                    </div>
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
                <div class="ee-loading">Loading…</div>
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

			if ((o.statuses || []).includes("Active")) {
				this.$wrap.find("#ee-filter-status").val("Active");
				this.state.status = "Active";
			}
		});
	}

	bind_events() {
		const $wrap = this.$wrap;

		// ---------- TOP MAIN TABS ----------
		$wrap.on("click", ".ee-main-tab", (e) => {
			const tab = $(e.currentTarget).data("mtab");
			this.switch_main_tab(tab);
		});

		$wrap.on("click", "#ee-search-btn", () => this.do_search());
		$wrap.on("keydown", "#ee-search", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.close_dropdown();
				this.do_search();
			}
			if (e.key === "Escape") this.close_dropdown();
		});

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
			this.state.status = "Active";
			this.state.employment_type = "";
			$wrap.find("#ee-filter-company").val("");
			$wrap.find("#ee-filter-status").val("Active");
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
		$(document).on("click.ee", (e) => {
			if (!$(e.target).closest(".ee-search-box").length) this.close_dropdown();
		});

		// ---------- INNER TABS ----------
		$wrap.on("click", ".ee-tab", (e) => {
			const tab = $(e.currentTarget).data("tab");
			$wrap.find(".ee-tab").removeClass("active");
			$(e.currentTarget).addClass("active");
			$wrap.find(".ee-tab-panel").addClass("hide");
			$wrap.find(`#tab-${tab}`).removeClass("hide");
		});

		$wrap.on("change", "#ee-lh-type, #ee-lh-year", () => this.apply_leave_filter());

		// Letters filters
		$wrap.on("change", "#ee-lt-doctype", (e) => {
			this._lt_doctype = e.target.value; this.reload_letters();
		});
		$wrap.on("change", "#ee-lt-type", (e) => {
			this._lt_type = e.target.value; this.reload_letters();
		});
		$wrap.on("change", "#ee-lt-status", (e) => {
			this._lt_status = e.target.value; this.reload_letters();
		});
		$wrap.on("click", "#ee-lt-clear", () => {
			this._lt_doctype = ""; this._lt_type = ""; this._lt_status = "";
			this.reload_letters();
		});

		// Letter actions
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

		// ---------- HR DETAIL FILTERS (Year, Month, Company) ----------
		$wrap.on("change", "#ee-hr-year", (e) => {
			this._hr_year = e.target.value;
			this.load_hr_dashboard();
		});
		$wrap.on("change", "#ee-hr-month", (e) => {
			this._hr_month = e.target.value;
			this.load_hr_dashboard();
		});
		$wrap.on("change", "#ee-hr-company", (e) => {
			this._hr_company = e.target.value;
			this.load_hr_dashboard();
		});
		$wrap.on("click", "#ee-hr-clear", () => {
			this._hr_year = "";
			this._hr_month = "";
			this._hr_company = "";
			this.load_hr_dashboard();
		});
	}

	/* ---------------- TOP MAIN TAB SWITCH ---------------- */
	switch_main_tab(tab) {
		this._active_mtab = tab;
		this.$wrap.find(".ee-main-tab").removeClass("active");
		this.$wrap.find(`.ee-main-tab[data-mtab="${tab}"]`).addClass("active");
		this.$wrap.find("#ee-back").addClass("hide");

		if (tab === "employees") {
			this.$wrap.find("#ee-search-wrap").removeClass("hide");
			this.$wrap.find("#ee-filter-bar").removeClass("hide");
			this.load_employees();
		} else if (tab === "hr") {
			this.$wrap.find("#ee-search-wrap").addClass("hide");
			this.$wrap.find("#ee-filter-bar").addClass("hide");
			this.load_hr_dashboard();
		} else if (tab === "org_chart") {
			this.$wrap.find("#ee-search-wrap").addClass("hide");
			this.$wrap.find("#ee-filter-bar").addClass("hide");
			this.load_organization_chart();
		}
	}

	/* ---------------- LIVE SEARCH ---------------- */
	live_search(q) {
		q = (q || "").trim();
		if (q.length < 1) { this.close_dropdown(); return; }
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

	close_dropdown() { this.$wrap.find(".ee-dropdown").removeClass("show"); }

	do_search() {
		this.state.search = this.$wrap.find("#ee-search").val() || "";
		this.close_dropdown();
		this.load_employees();
	}

	/* ---------------- EMPLOYEE LIST ---------------- */
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
			this.load_dashboard(),
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
		});
	}

	render_list() {
		this.$wrap.find("#ee-back").addClass("hide");
		this.$wrap.find("#ee-search-wrap").removeClass("hide");
		this.$wrap.find("#ee-filter-bar").removeClass("hide");
		this.$wrap.find("#ee-main-tabs").removeClass("hide");
		this.$wrap.find(".ee-main-tab").removeClass("active");
		this.$wrap.find('.ee-main-tab[data-mtab="employees"]').addClass("active");
		this._active_mtab = "employees";

		this.$body.html(`
        <div class="ee-sec" id="ee-stats"></div>
        <div class="ee-sec">
            <h3 class="ee-sec-title"><i class="fa fa-users"></i> Employees
                <span style="color:#94a3b8;font-weight:500;font-size:13px">
                    (${this.employees.length})</span>
            </h3>
            <div class="ee-emp-grid" id="ee-emp-grid"></div>
        </div>
    `);

		this.render_stats();

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
				<div class="ee-stat"><div class="lbl">Total Employees</div><div class="val">${c.active || 0}</div></div>
				<div class="ee-stat" style="border-left-color:#22c55e"><div class="lbl">Active</div><div class="val">${c.active || 0}</div></div>
				<div class="ee-stat" style="border-left-color:#ef4444"><div class="lbl">Left</div><div class="val">${c.left || 0}</div></div>
				<div class="ee-stat" style="border-left-color:#f59e0b"><div class="lbl">Departments</div><div class="val">${c.departments || 0}</div></div>
			</div>
		`);
	}

	/* ==================================================
	   HR DETAIL DASHBOARD
	   ================================================== */
	_build_year_options() {
		const y = new Date().getFullYear();
		const opts = [];
		for (let i = 0; i < 6; i++) opts.push(y - i);
		return opts;
	}

	_build_month_options() {
		return [
			{ val: "1", label: "January" },
			{ val: "2", label: "February" },
			{ val: "3", label: "March" },
			{ val: "4", label: "April" },
			{ val: "5", label: "May" },
			{ val: "6", label: "June" },
			{ val: "7", label: "July" },
			{ val: "8", label: "August" },
			{ val: "9", label: "September" },
			{ val: "10", label: "October" },
			{ val: "11", label: "November" },
			{ val: "12", label: "December" },
		];
	}

	_combined_month_param() {
		const m = this._hr_month;
		const y = this._hr_year;
		const now = new Date();
		if (y && m) return `${y}-${String(m).padStart(2, "0")}`;
		if (y) return `${y}-01`;
		if (m) return `${now.getFullYear()}-${String(m).padStart(2, "0")}`;
		return null;
	}

	load_hr_dashboard() {
		this.$body.html(`<div class="ee-loading">Loading HR dashboard…</div>`);

		this._call("get_hr_dashboard", {
			month: this._combined_month_param(),
			company: this._hr_company || null,
		}).then((d) => {
			if (!d) return;
			this.hr_data = d;
			this.render_hr_dashboard();
		});
	}
	/* ==================================================
   ORGANISATION CHART TAB
   ================================================== */
	load_organization_chart() {
		this.$body.html(`<div class="ee-loading">Loading organisation chart…</div>`);

		this._call("get_organization_chart", {
			company: null, // Optional company filter — filhal off
		}).then((d) => {
			if (!d) return;
			this.org_data = d;
			this.render_organization_chart();
		});
	}

	render_organization_chart() {
		const d = this.org_data || { roots: [], total: 0 };

		if (!d.roots || !d.roots.length) {
			this.$body.html(`
                <div class="oc-wrap">
                    <div class="oc-empty">
                        <i class="fa fa-sitemap" style="font-size:44px;opacity:.6"></i>
                        <div style="margin-top:14px">No reporting hierarchy found. Please set "Reports To" on employees.</div>
                    </div>
                </div>`);
			return;
		}

		this.$body.html(`
            <div class="oc-wrap">
                <div class="oc-actions">
                    <button id="oc-expand-all"><i class="fa fa-plus-square-o"></i> Expand All</button>
                    <button id="oc-collapse-all"><i class="fa fa-minus-square-o"></i> Collapse All</button>
                </div>
                <div class="oc-tree" id="oc-tree"></div>
            </div>
        `);

		const $tree = this.$body.find("#oc-tree");
		const treeEl = $tree[0];

		if (d.roots.length === 1) {
			// Single root — normal tree
			const rootUl = document.createElement("ul");
			rootUl.appendChild(this.create_org_node(d.roots[0]));
			treeEl.appendChild(rootUl);
		} else {
			// Multiple roots — side by side, each as its own small tree
			const wrap = document.createElement("div");
			wrap.className = "oc-roots";
			d.roots.forEach((root) => {
				const miniUl = document.createElement("ul");
				miniUl.style.paddingTop = "0";
				miniUl.appendChild(this.create_org_node(root));
				wrap.appendChild(miniUl);
			});
			treeEl.appendChild(wrap);
		}

		this.$body.find("#oc-expand-all").on("click", () => this.oc_toggle_all(true));
		this.$body.find("#oc-collapse-all").on("click", () => this.oc_toggle_all(false));
	}

	create_org_node(person) {
		const li = document.createElement("li");

		const card = document.createElement("div");
		card.className = "oc-card";

		const hasChildren = person.children && person.children.length;

		// ---------- Photo ----------
		const photoWrap = document.createElement("div");
		photoWrap.className = "oc-photo-wrap";

		const makeFallbackIcon = () => {
			const i = document.createElement("i");
			i.className = "fa fa-user";
			return i;
		};

		if (person.image) {
			const img = document.createElement("img");
			img.src = person.image;
			img.alt = "";                         // ⬅️ IMPORTANT: no alt text overlay
			img.draggable = false;
			img.onerror = function () {
				photoWrap.replaceChildren(makeFallbackIcon());
			};
			photoWrap.appendChild(img);
		} else {
			photoWrap.appendChild(makeFallbackIcon());
		}

		// ---------- Text ----------
		const name = document.createElement("div");
		name.className = "oc-name";
		name.textContent = person.employee_name || person.name || "-";
		name.title = person.employee_name || "";

		const code = document.createElement("div");
		code.className = "oc-code";
		code.textContent = person.employee_number || person.name || "-";

		const desig = document.createElement("div");
		desig.className = "oc-desig";
		desig.textContent = person.designation || "-";
		desig.title = person.designation || "";

		const dept = document.createElement("div");
		dept.className = "oc-dept";
		dept.textContent = person.department || "-";
		dept.title = person.department || "";

		card.append(photoWrap, name, code, desig, dept);

		// ---------- Children ----------
		if (hasChildren) {
			card.classList.add("has-children");

			const toggle = document.createElement("div");
			toggle.className = "oc-toggle";
			toggle.textContent = "+";
			card.appendChild(toggle);

			const ul = document.createElement("ul");
			ul.className = "oc-hidden";

			person.children.forEach((child) => {
				ul.appendChild(this.create_org_node(child));
			});

			card.setAttribute("aria-expanded", "false");

			card.addEventListener("click", (e) => {
				e.stopPropagation();
				const opening = ul.classList.contains("oc-hidden");
				ul.classList.toggle("oc-hidden");
				toggle.textContent = opening ? "−" : "+";
				card.setAttribute("aria-expanded", opening ? "true" : "false");
			});

			li.appendChild(card);
			li.appendChild(ul);
		} else {
			li.appendChild(card);
		}

		return li;
	}

	oc_toggle_all(expand) {
		this.$body.find(".oc-tree ul ul").each((i, el) => {
			const $ul = $(el);
			if (expand) $ul.removeClass("oc-hidden");
			else $ul.addClass("oc-hidden");
		});
		this.$body.find(".oc-card[aria-expanded]").each((i, el) => {
			const $c = $(el);
			$c.attr("aria-expanded", expand ? "true" : "false");
			$c.find(".oc-toggle").text(expand ? "−" : "+");
		});
	}

	render_hr_dashboard() {
		const d = this.hr_data;
		if (!d) return;

		const yearOpts = this._build_year_options();
		const monthOpts = this._build_month_options();
		const companyOpts = d.companies || [];

		const filtersHtml = `
            <div class="ee-hr-filter-bar">
                <select class="ee-select" id="ee-hr-year">
                    <option value="">All Years</option>
                    ${yearOpts.map((y) =>
			`<option value="${y}" ${String(this._hr_year) === String(y) ? "selected" : ""}>${y}</option>`
		).join("")}
                </select>
                <select class="ee-select" id="ee-hr-month">
                    <option value="">All Months</option>
                    ${monthOpts.map((o) =>
			`<option value="${o.val}" ${this._hr_month === o.val ? "selected" : ""}>${o.label}</option>`
		).join("")}
                </select>
                <select class="ee-select" id="ee-hr-company">
                    <option value="">All Companies</option>
                    ${companyOpts.map((c) =>
			`<option value="${frappe.utils.escape_html(c)}" ${this._hr_company === c ? "selected" : ""}>${frappe.utils.escape_html(c)}</option>`
		).join("")}
                </select>
                <button class="ee-btn ee-btn-dark" id="ee-hr-clear"
                    style="margin-left:auto;font-size:12px;padding:7px 16px">Reset</button>
            </div>
        `;

		const k = d.kpis || {};

		const kpisHtml = `
            <div class="ee-hr-kpis">
                ${this._hr_kpi("Total Employees", k.total_employees, "fa-users", "#1f6fe5")}
                ${this._hr_kpi("New Hires", k.new_hires, "fa-user-plus", "#22c55e")}
                ${this._hr_kpi("Turnover Rate", (k.turnover_rate || 0) + "%", "fa-exchange", "#ef4444")}
                ${this._hr_kpi("Attrition Rate", (k.attrition_rate || 0) + "%", "fa-line-chart", "#f97316")}
                ${this._hr_kpi("Offer Acceptance", (k.offer_acceptance_rate || 0) + "%", "fa-check-circle", "#8b5cf6")}
            </div>
        `;

		const chartsHtml = `
            <div class="ee-hr-charts">
                <div class="ee-hr-panel">
                    <h4>Headcount Trend (12 Months)</h4>
                    <div class="chart-wrap" id="ee-hr-chart-headcount"></div>
                </div>
                <div class="ee-hr-panel">
                    <h4>Employee Distribution by Department</h4>
                    <div class="chart-wrap" id="ee-hr-chart-dept"></div>
                </div>
                <div class="ee-hr-panel">
                    <h4>Employment Type</h4>
                    <div class="chart-wrap" id="ee-hr-chart-etype"></div>
                </div>
                <div class="ee-hr-panel">
                    <h4>Recruitment Funnel</h4>
                    <div class="chart-wrap ee-funnel-wrap" id="ee-hr-funnel"></div>
                </div>
                <div class="ee-hr-panel">
                    <h4>Employee Tenure</h4>
                    <div id="ee-hr-tenure" style="padding-top:6px"></div>
                </div>
            </div>
        `;

		this.$body.html(filtersHtml + kpisHtml + chartsHtml);
		setTimeout(() => this.draw_hr_charts(), 60);
	}

	_hr_kpi(label, value, icon, color) {
		const v = (value === null || value === undefined) ? 0 : value;
		return `
            <div class="ee-hr-kpi">
                <div class="ico" style="background:${color}1f;color:${color}">
                    <i class="fa ${icon}"></i></div>
                <div class="body">
                    <div class="lbl">${label}</div>
                    <div class="val">${v}</div>
                </div>
            </div>`;
	}

	draw_hr_charts() {
		const d = this.hr_data;
		if (!d) return;

		// ---------- Headcount Trend (line chart) ----------
		const el1 = this.$body.find("#ee-hr-chart-headcount")[0];
		if (el1 && typeof frappe.Chart === "function") {
			try {
				new frappe.Chart(el1, {
					type: "line",
					data: {
						labels: (d.headcount_trend || []).map((x) => x.label),
						datasets: [{ values: (d.headcount_trend || []).map((x) => x.value) }],
					},
					colors: ["#1f6fe5"],
					height: 240,
					lineOptions: { regionFill: 1, hideDots: 0, dotSize: 4 },
					axisOptions: { xAxisMode: "tick" },
				});
			} catch (e) { }
		}

		// ---------- Department (custom donut with right legend) ----------
		this.draw_donut(
			"#ee-hr-chart-dept",
			(d.by_department || []).map((x) => x.label),
			(d.by_department || []).map((x) => x.value),
			["#1f6fe5", "#f97316", "#22c55e", "#8b5cf6", "#eab308",
				"#ef4444", "#06b6d4", "#64748b", "#a855f7", "#0ea5e9"]
		);

		// ---------- Employment Type (custom donut with right legend) ----------
		this.draw_donut(
			"#ee-hr-chart-etype",
			(d.by_employment_type || []).map((x) => x.label),
			(d.by_employment_type || []).map((x) => x.value),
			["#1f6fe5", "#a855f7", "#f59e0b", "#22c55e", "#ef4444"]
		);

		// ---------- Recruitment Funnel (SVG trapezoids) ----------
		const funnelEl = this.$body.find("#ee-hr-funnel")[0];
		if (funnelEl) {
			funnelEl.innerHTML = this._build_funnel_svg(d.recruitment_funnel || []);
		}

		// ---------- Tenure bars ----------
		const tenureEl = this.$body.find("#ee-hr-tenure")[0];
		if (tenureEl) {
			const rows = d.tenure || [];
			const max = Math.max(...rows.map((r) => r.value), 1);
			tenureEl.innerHTML = rows.map((r) => `
                <div style="margin-bottom:12px">
                    <div style="display:flex;justify-content:space-between;font-size:12px;color:#475569;margin-bottom:4px">
                        <span>${frappe.utils.escape_html(r.label)}</span>
                        <b>${r.value}</b>
                    </div>
                    <div style="height:10px;background:#eef2f7;border-radius:5px">
                        <div style="width:${(r.value / max) * 100}%;height:100%;background:#1f6fe5;border-radius:5px"></div>
                    </div>
                </div>`).join("");
		}
	}

	/* ---------- Custom Donut (center total + right legend) ---------- */
	draw_donut(containerSel, labels, values, colors, centerLabel) {
		const el = this.$body.find(containerSel)[0];
		if (!el) return;

		const total = values.reduce((a, b) => a + b, 0);
		if (!total) {
			el.innerHTML = `<div class="ee-empty" style="border:none">No data</div>`;
			return;
		}

		const size = 180;
		const radius = 62;
		const stroke = 26;
		const cx = size / 2;
		const cy = size / 2;
		const circ = 2 * Math.PI * radius;

		let offset = 0;
		const segments = values.map((v, i) => {
			const pct = v / total;
			const dash = pct * circ;
			const color = colors[i % colors.length];
			const seg = `<circle cx="${cx}" cy="${cy}" r="${radius}"
                fill="none" stroke="${color}" stroke-width="${stroke}"
                stroke-dasharray="${dash} ${circ - dash}"
                stroke-dashoffset="${-offset}"
                transform="rotate(-90 ${cx} ${cy})" />`;
			offset += dash;
			return seg;
		}).join("");

		const legend = labels.map((l, i) => {
			const pct = ((values[i] / total) * 100).toFixed(1);
			return `<div class="ee-dl-item">
                <span class="dot" style="background:${colors[i % colors.length]}"></span>
                <span class="lbl">${frappe.utils.escape_html(l || "Not Set")}</span>
                <span class="pct">${pct}%</span>
            </div>`;
		}).join("");

		el.innerHTML = `
            <div class="ee-donut-wrap">
                <div class="ee-donut-svg">
                    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
                        ${segments}
                        <text x="${cx}" y="${cy - 2}" text-anchor="middle"
                            style="font-size:26px;font-weight:700;fill:#0f172a">${total}</text>
                        <text x="${cx}" y="${cy + 16}" text-anchor="middle"
                            style="font-size:10.5px;fill:#94a3b8">Employees</text>
                    </svg>
                </div>
                <div class="ee-donut-legend">${legend}</div>
            </div>`;
	}

	/* ---------- Custom Funnel (SVG trapezoids) ---------- */
	_build_funnel_svg(rows) {
		if (!rows || !rows.length) {
			return `<div class="ee-empty" style="border:none">No data</div>`;
		}

		const total = rows.length;
		const maxVal = rows[0].value || 1;

		const svgW = 520;
		const stepH = 52;
		const gap = 4;
		const svgH = total * stepH + 10;

		// Funnel drawing area
		const funnelCenterX = 270;
		const funnelMaxW = 280;
		const funnelMinW = 130;

		const colors = ["#1f6fe5", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe"];

		let body = "";
		for (let i = 0; i < total; i++) {
			const r = rows[i];
			const ratio = r.value / maxVal;
			const nextRatio = (i < total - 1) ? (rows[i + 1].value / maxVal) : (ratio * 0.88);

			const topW = funnelMinW + (funnelMaxW - funnelMinW) * ratio;
			const botW = funnelMinW + (funnelMaxW - funnelMinW) * nextRatio;

			const yTop = i * stepH + 5;
			const yBot = yTop + stepH - gap;

			const topL = funnelCenterX - topW / 2;
			const topR = funnelCenterX + topW / 2;
			const botL = funnelCenterX - botW / 2;
			const botR = funnelCenterX + botW / 2;

			const color = colors[i % colors.length];
			const pct = ((r.value / maxVal) * 100).toFixed(r.value >= 10 ? 0 : 1);
			const midY = (yTop + yBot) / 2;

			body += `
                <polygon points="${topL},${yTop} ${topR},${yTop} ${botR},${yBot} ${botL},${yBot}"
                    fill="${color}" />
                <text x="${funnelCenterX}" y="${midY + 5}" text-anchor="middle"
                    fill="#ffffff" font-weight="700" font-size="14">${r.value}</text>
                <text x="15" y="${midY + 4}" text-anchor="start"
                    fill="#475569" font-weight="600" font-size="12.5">${frappe.utils.escape_html(r.label)}</text>
                <text x="${svgW - 15}" y="${midY + 4}" text-anchor="end"
                    fill="#64748b" font-weight="600" font-size="12">${pct}%</text>
            `;
		}

		return `<svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}"
            preserveAspectRatio="xMidYMid meet" style="max-height:340px;display:block">${body}</svg>`;
	}

	/* ---------------- PROFILE ---------------- */
	open_profile(employee) {
		this.$body.html(`<div class="ee-loading">Loading profile…</div>`);
		this.$wrap.find("#ee-back").removeClass("hide");
		this.$wrap.find("#ee-search-wrap").addClass("hide");
		this.$wrap.find("#ee-filter-bar").addClass("hide");
		this.$wrap.find("#ee-main-tabs").addClass("hide");

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
		this.$wrap.find("#ee-main-tabs").removeClass("hide");
		this.$wrap.find("#ee-back").addClass("hide");
		this.$wrap.find(".ee-main-tab").removeClass("active");
		this.$wrap.find('.ee-main-tab[data-mtab="employees"]').addClass("active");
		this._active_mtab = "employees";
		this.$wrap.find("#ee-search-wrap").removeClass("hide");
		this.$wrap.find("#ee-filter-bar").removeClass("hide");
		this.load_employees();
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

			<!-- TAB 1: IDENTIFICATION -->
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

            <!-- TAB 3: LETTERS -->
            ${(this.letters && this.letters.has_letters) ? `
            <div class="ee-tab-panel hide" id="tab-letters"></div>` : ""}
		`);

		this.render_leave_history(p.leave.history || []);
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
		setTimeout(() => this.draw_letter_charts(), 60);
	}

	_letters_cards_html(L) {
		const k = L.kpis || {};
		return `
        <div class="ee-grid-cards" style="margin-bottom:18px">
            <div class="ee-stat"><div class="lbl">Total Letters</div><div class="val">${k.total || 0}</div></div>
            <div class="ee-stat" style="border-left-color:#8c99a6"><div class="lbl">Approved</div><div class="val">${k.approved || 0}</div></div>
            <div class="ee-stat" style="border-left-color:#eda100"><div class="lbl">Draft</div><div class="val">${k.draft || 0}</div></div>
            <div class="ee-stat" style="border-left-color:#f97316"><div class="lbl">Pending</div><div class="val">${k.pending || 0}</div></div>
            <div class="ee-stat" style="border-left-color:#e34948"><div class="lbl">Rejected</div><div class="val">${k.rejected || 0}</div></div>
        </div>`;
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
            <select class="ee-select" id="ee-lt-doctype"><option value="">All Doc Types</option>${dtOpts}</select>
            <select class="ee-select" id="ee-lt-type"><option value="">All Letter Types</option>${tOpts}</select>
            <select class="ee-select" id="ee-lt-status"><option value="">All Status</option>${sOpts}</select>
            <button class="ee-btn ee-btn-dark ee-lt-clear" id="ee-lt-clear">Clear</button>
        </div>`;
	}

	_letters_charts_html() {
		return `
        <div class="ee-charts" style="margin-bottom:22px">
            <div class="ee-panel"><h4>By Status</h4><div id="ee-chart-letter-status" class="ee-chart-mini"></div></div>
            <div class="ee-panel"><h4>By Letter Type</h4><div id="ee-chart-letter-type" class="ee-chart-mini"></div></div>
        </div>`;
	}

	draw_letter_charts() {
		const L = this.letters || {};
		if (!L.charts) return;

		if (this._lt_chart_status) { try { this._lt_chart_status.destroy(); } catch (e) { } }
		if (this._lt_chart_type) { try { this._lt_chart_type.destroy(); } catch (e) { } }

		const STATUS_COLORS = {
			"Approved": "#8c99a6", "Draft": "#eda100",
			"CEO Approval": "#199e70", "SSD Approval": "#e34948",
			"Rejected": "#e34948", "Pending": "#f97316",
		};
		const FALLBACK = ["#2a78d6", "#8b5cf6", "#06b6d4", "#10b981", "#ef4444", "#f59e0b"];

		const st = L.charts.by_status || { labels: [], data: [] };
		const stColors = st.labels.map((lbl, i) => STATUS_COLORS[lbl] || FALLBACK[i % FALLBACK.length]);
		const elStatus = this.$body.find("#ee-chart-letter-status")[0];
		if (elStatus && typeof frappe.Chart === "function") {
			try {
				this._lt_chart_status = new frappe.Chart(elStatus, {
					type: "donut",
					data: { labels: st.labels, datasets: [{ values: st.data }] },
					colors: stColors, height: 230,
				});
			} catch (e) { }
		}

		const tp = L.charts.by_type || { labels: [], data: [] };
		const elType = this.$body.find("#ee-chart-letter-type")[0];
		if (elType && typeof frappe.Chart === "function") {
			try {
				this._lt_chart_type = new frappe.Chart(elType, {
					type: "bar",
					data: { labels: tp.labels, datasets: [{ values: tp.data }] },
					colors: ["#2a78d6"], height: 230,
					axisOptions: { xAxisMode: "tick" },
				});
			} catch (e) { }
		}
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
			this.letters = res;
			this.render_letters_panel();
			this.$body.find('[data-tab="letters"] span').text(this.letters.count);
		});
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
                <button class="ee-btn-mini ee-letter-act" data-action="view"
                    data-doctype="${frappe.utils.escape_html(r.doctype)}"
                    data-name="${frappe.utils.escape_html(r.name)}">
                    <i class="fa fa-external-link"></i> View</button>
                <button class="ee-btn-mini ee-letter-act" data-action="preview"
                    data-doctype="${frappe.utils.escape_html(r.doctype)}"
                    data-name="${frappe.utils.escape_html(r.name)}">
                    <i class="fa fa-eye"></i> Preview</button>
                ${(r.status === "Approved") ? `
                <button class="ee-btn-mini ee-btn-mini-primary ee-letter-act" data-action="print"
                    data-doctype="${frappe.utils.escape_html(r.doctype)}"
                    data-name="${frappe.utils.escape_html(r.name)}">
                    <i class="fa fa-print"></i> Print</button>` : ""}
            </td>
        </tr>`).join("");

		return `
        <div class="ee-scroll-x">
            <table class="ee-table">
                <thead><tr>
                    <th>Reference</th><th>Doc Type</th><th>Type</th>
                    <th>Status</th><th>Date</th><th>Actions</th>
                </tr></thead>
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

		const total_slips = slips.length;
		let total_earnings = 0, total_deductions = 0, total_net = 0, total_days = 0;

		slips.forEach((s) => {
			total_earnings += flt(s.gross_pay);
			total_deductions += flt(s.total_deduction);
			total_net += flt(s.net_pay);
			total_days += flt(s.payment_days);
		});

		const last = slips[0];
		const avg_net = total_net / total_slips;
		const last_basic = this._amt(last, "Basic Salary");

		const cards = `
        <div class="ee-grid-cards" style="margin-bottom:22px">
            <div class="ee-stat"><div class="lbl">Total Salary Slips</div><div class="val">${total_slips}</div></div>
            <div class="ee-stat" style="border-left-color:#22c55e"><div class="lbl">Total Earnings</div><div class="val">${this.money(total_earnings)}</div></div>
            <div class="ee-stat" style="border-left-color:#ef4444"><div class="lbl">Total Deductions</div><div class="val">${this.money(total_deductions)}</div></div>
            <div class="ee-stat" style="border-left-color:#06b6d4"><div class="lbl">Total Net Pay</div><div class="val">${this.money(total_net)}</div></div>
        </div>
        <div class="ee-grid-cards" style="margin-bottom:22px">
            <div class="ee-stat" style="border-left-color:#8b5cf6"><div class="lbl">Last Net Pay</div>
                <div class="val">${this.money(last.net_pay)}</div>
                <div style="font-size:11px;color:#94a3b8;margin-top:4px">
                    ${this.d(last.start_date)} → ${this.d(last.end_date)}</div></div>
            <div class="ee-stat" style="border-left-color:#f59e0b"><div class="lbl">Average Net Pay</div><div class="val">${this.money(avg_net)}</div></div>
            <div class="ee-stat" style="border-left-color:#0ea5e9"><div class="lbl">Total Paid Days</div><div class="val">${this.n(total_days)}</div></div>
            <div class="ee-stat" style="border-left-color:#10b981"><div class="lbl">Last Basic Salary</div><div class="val">${this.money(last_basic)}</div></div>
        </div>`;

		const comp = (s, name) => this._amt(s, name);

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
                <thead><tr>
                    <th>Salary Slip</th><th>Employee</th><th>Employee Name</th>
                    <th>Employee ID</th><th>Gender</th><th>Nationality</th>
                    <th>Marital Status</th><th>Company</th><th>Department</th>
                    <th>Designation</th><th>Posting Date</th><th>Start Date</th>
                    <th>End Date</th><th style="text-align:right">Payment Days</th>
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
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

		return cards + table;
	}

	/* ---------------- LEAVE HISTORY ---------------- */
	render_leave_history(history) {
		this._leave_history = history || [];

		const types = [...new Set(this._leave_history.map((h) => h.leave_type).filter(Boolean))].sort();
		const $t = this.$body.find("#ee-lh-type");
		$t.html(`<option value="">All Leave Types</option>` +
			types.map((t) => `<option value="${frappe.utils.escape_html(t)}">${frappe.utils.escape_html(t)}</option>`).join(""));

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