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
	
	if (!data || data.length === 0) {
		console.log("Kanban Debug: No data found in listview.data or listview.kanban.data");
		return;
	}

	const $all_cards = $('.kanban-card');
	console.log(`Kanban Debug: Processing ${data.length} data records. Found ${$all_cards.length} .kanban-card elements in DOM.`);

	if ($all_cards.length > 0 && data.length > 0) {
		console.log("Kanban Debug: First DOM card data-name:", $all_cards.first().attr('data-name'));
		console.log("Kanban Debug: First data record name:", data[0].name);
	}

	const today = frappe.datetime.get_today();
	const next_7_days = frappe.datetime.add_days(today, 7);

	data.forEach((doc, index) => {
		const safe_name = doc.name.replace(/'/g, "\\'");
		const $card = $(`.kanban-card[data-name='${safe_name}']`);

		if (index < 3) {
			console.log(`Kanban Debug [${index}]: Name=${doc.name}, Date=${doc.expected_closing}, Status=${doc.status}, CardFound=${$card.length > 0}`);
		}

		if (!$card.length) return;

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
