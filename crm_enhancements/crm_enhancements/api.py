import frappe

# This is the fast function the user's button will call.
@frappe.whitelist()
def enqueue_project_creation(opportunity_name, user):
    """
    Called by the client to quickly add the main task to the background queue.
    """
    frappe.enqueue(
        # This is the explicit path to our worker function below.
        'crm_enhancements.api.create_project_from_opportunity_background',
        queue='long',
        timeout=1800,
        opportunity_name=opportunity_name,
        user=user
    )
    return {'status': 'queued'}


# This is the long-running function for the background worker.
def create_project_from_opportunity_background(opportunity_name, user):
    """
    This function does the heavy lifting in the background.
    """
    try:
        opp = frappe.get_doc('Opportunity', opportunity_name)

        if opp.custom_created_project:
            return

        project = frappe.new_doc('Project')
        project.project_name = opp.custom_opportunity_name

        direct_mappings = {
            'custom_scope_rank': 'custom_scope_rank', 'custom_schedule_rank': 'custom_schedule_rank',
            'custom_budget_rank': 'custom_budget_rank', 'custom_description': 'custom_project_description',
            'custom_general_scope_description': 'custom_general_scope_description',
            'custom_project_start_date': 'expected_start_date', 'custom_project_end_date': 'expected_end_date',
            'custom_notes_for_scheduling': 'custom_notes_for_scheduling', 'custom_delivery_date_time': 'custom_delivery_date_time',
            'custom_setup_date_time': 'custom_setup_date_time', 'custom_event_date_time': 'custom_event_date_time',
            'custom_take_down_date_time': 'custom_take_down_date_time',
            'custom_delivery_date_time_notes': 'custom_delivery_date_time_notes',
            'custom_setup_date_time_notes': 'custom_setup_date_time_notes',
            'custom_event_date_time_notes': 'custom_event_date_time_notes',
            'custom_take_down_date_time_notes': 'custom_take_down_date_time_notes',
            'opportunity_amount': 'custom_project_dollar_amount', 'custom_estimated_cost': 'custom_project_cost',
            'party_name': 'customer'
        }
        for source_field, target_field in direct_mappings.items():
            project.set(target_field, opp.get(source_field))

        child_table_mappings = {
            'custom_value_stream': 'custom_value_stream', 'custom_contacts__address_table': 'custom_contacts__address_table',
            'custom_scope_contributors': 'custom_scope_contributors', 'custom_design_customer_requests': 'custom_design_customer_requests',
            'custom_design_deliverables': 'custom_design_deliverables', 'custom_build_customer_requests': 'custom_build_customer_requests',
            'custom_build_deliverables': 'custom_build_deliverables', 'custom_service_customer_requests': 'custom_service_customer_requests',
            'custom_service_deliverables': 'custom_service_deliverables', 'custom_rent_customer_requests': 'custom_rent_customer_requests',
            'custom_rent_deliverables': 'custom_rent_deliverables'
        }
        for source_table, target_table in child_table_mappings.items():
            project.set(target_table, [])
            for source_row in opp.get(source_table):
                new_row = project.append(target_table, {})
                new_row.update(source_row.as_dict())

        project.insert(ignore_permissions=True)
        opp.custom_created_project = project.name
        opp.save(ignore_permissions=True)
        frappe.db.commit()

        # Create a success notification for the user.
        frappe.get_doc({
            "doctype": "Notification Log", "for_user": user, "document_type": "Project",
            "document_name": project.name, "subject": f"Project {project.name} has been created successfully."
        }).insert(ignore_permissions=True)

    except Exception:
        # If anything fails, log the full error and notify the user.
        frappe.log_error(frappe.get_traceback(), "CRM Enhancements App Background Job Failed")
        frappe.get_doc({
            "doctype": "Notification Log", "for_user": user, "subject": f"Failed to create project from Opportunity {opportunity_name}",
            "document_type": "Opportunity", "document_name": opportunity_name
        }).insert(ignore_permissions=True)
