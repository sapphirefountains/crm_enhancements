frappe.provide("frappe.listview_settings");

console.log("Opportunity List script loaded.");

frappe.listview_settings['Opportunity'] = {
	// Force-fetch these fields even if not in the list view/kanban settings
	add_fields: ["expected_closing", "status"],
	refresh: function (listview) {
		console.log("Opportunity refresh. View:", listview.view_name);
		if (listview.view_name === 'Kanban') {
			inject_kanban_custom_css();
			setup_kanban_color_observer(listview);
		}
	}
};

function inject_kanban_custom_css() {
	if (document.getElementById('kanban-opportunity-colors')) return;
	const css = `
		.kanban-card[data-date-status="overdue"], 
		.kanban-card[data-date-status="overdue"] .kanban-card-body { 
			background-color: #ffebee !important; 
		}
		.kanban-card[data-date-status="soon"], 
		.kanban-card[data-date-status="soon"] .kanban-card-body { 
			background-color: #fff9c4 !important; 
		}
		.kanban-card[data-doc-status="excluded"], 
		.kanban-card[data-doc-status="excluded"] .kanban-card-body {
			background-color: var(--card-bg) !important;
		}
	`;
	const style = document.createElement('style');
	style.id = 'kanban-opportunity-colors';
	style.innerHTML = css;
	document.head.appendChild(style);
}

function setup_kanban_color_observer(listview) {
	console.log("Kanban Debug: Initializing observer...");
	
	// Use Frappe's built-in wrapper instead of guessing the class name
	const targetNode = listview.$result ? listview.$result.get(0) : document.body;
	
	console.log("Kanban Debug: Target node found for observer.", targetNode);

	// Delay initial run slightly to allow Vue/Frappe to finish rendering cards
	setTimeout(() => {
		apply_kanban_colors(listview);
	}, 1000);

	const observer = new MutationObserver(() => {
		apply_kanban_colors(listview);
	});

	observer.observe(targetNode, { childList: true, subtree: true });

	$(document).on('route-change', () => {
		observer.disconnect();
	});
}

function apply_kanban_colors(listview) {
	const data = listview.data || (listview.kanban && listview.kanban.data);
	
	if (!data || data.length === 0) return;

	const today = frappe.datetime.get_today();
	const next_7_days = frappe.datetime.add_days(today, 7);

	// Create a map for faster lookup: { "CRM-OPP-2026-00003": { doc data } }
	const dataMap = {};
	data.forEach(doc => {
		dataMap[doc.name] = doc;
	});

	$('.kanban-card').each(function() {
		const $card = $(this);
		
		// In newer Frappe versions, data-name is gone. The name is usually in the title.
		let card_name = $card.attr('data-name'); 
		
		if (!card_name) {
			// Fallback 1: Look for an anchor tag or text in the title that matches a record name
			// This regex matches things like CRM-OPP-2026-00003
			const card_text = $card.text();
			const match = card_text.match(/[A-Z0-9-]{5,}/); // Broad match for DocName patterns
			if (match && dataMap[match[0]]) {
				card_name = match[0];
			}
		}

		if (!card_name || !dataMap[card_name]) return;

		const doc = dataMap[card_name];

		// 1. Status Check
		const is_excluded = ["Closed Won", "Lost", "Closed Lost"].includes(doc.status);
		$card.attr('data-doc-status', is_excluded ? 'excluded' : 'active');

		if (is_excluded) {
			$card.removeAttr('data-date-status');
			return;
		}

		// 2. Date Logic
		if (doc.expected_closing) {
			if (doc.expected_closing < today) {
				$card.attr('data-date-status', 'overdue');
			} else if (doc.expected_closing >= today && doc.expected_closing <= next_7_days) {
				$card.attr('data-date-status', 'soon');
			} else {
				$card.removeAttr('data-date-status');
			}
		} else {
			$card.removeAttr('data-date-status');
		}
	});
}
