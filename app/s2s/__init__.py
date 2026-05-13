from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
import requests
from datetime import datetime
from grants_api.app.services.grants_dot_gov import GrantsGovService
from grants_api.app.schemas.opportunity import OpportunityResponse

s2s_bp = Blueprint('s2s', __name__, url_prefix='/s2s')

# Initialize Grants.gov service
grants_service = GrantsGovService()

@s2s_bp.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'Grants.gov S2S Integration'})

@s2s_bp.route('/opportunities', methods=['GET'])
def search_opportunities():
    \"\"\"
    Search for grant opportunities via Grants.gov S2S API.
    Supports filters: query, agency, category, limit, offset.
    \"\"\"
    query = request.args.get('query', '')
    agency = request.args.get('agency', '')
    category = request.args.get('category', '')
    limit = request.args.get('limit', default=50, type=int)
    offset = request.args.get('offset', default=0, type=int)
    
    # Call Grants.gov service
    results = grants_service.search_opportunities({
        'query': query,
        'agency': agency,
        'category': category,
        'limit': limit,
        'offset': offset
    })
    
    return jsonify({
        'count': len(results),
        'results': results
    })

@s2s_bp.route('/opportunities/<opportunity_number>', methods=['GET'])
def get_opportunity(opportunity_number):
    \"\"\"
    Get a specific opportunity by its number.
    \"\"\"
    opportunity = grants_service.get_opportunity_by_number(opportunity_number)
    if opportunity:
        return jsonify(opportunity)
    return jsonify({'error': 'Opportunity not found'}), 404

@s2s_bp.route('/submit-application', methods=['POST'])
def submit_application():
    \"\"\"
    Submit a grant application via Grants.gov S2S API.
    Expected JSON body:
    {
        \"opportunity_number\": \"string\",
        \"applicant_data\": {},
        \"documents\": []
    }
    \"\"\"
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    opportunity_number = data.get('opportunity_number')
    application_data = data.get('applicant_data', {})
    
    if not opportunity_number:
        return jsonify({'error': 'Opportunity number is required'}), 400
    
    # Submit application via Grants.gov service
    success = grants_service.submit_application(opportunity_number, application_data)
    
    if success:
        return jsonify({'status': 'success', 'message': 'Application submitted successfully'})
    else:
        return jsonify({'status': 'error', 'message': 'Failed to submit application'}), 500

@s2s_bp.route('/profiles', methods=['POST'])
def create_profile():
    \"\"\"
    Create a new applicant profile.
    Expected JSON body:
    {
        \"duns_number\": \"string\",
        \"entity_name\": \"string\",
        \"address_line_1\": \"string\",
        \"city\": \"string\",
        \"state\": \"string\",
        \"zip_code\": \"string\",
        \"country\": \"string\",
        \"phone\": \"string\",
        \"email\": \"string\"
    }
    \"\"\"
    data = request.get_json()
    # Here you would call the Grants.gov service to create a profile
    # For now, return a mock response
    return jsonify({
        'status': 'success',
        'message': 'Profile created successfully',
        'profile_id': '123456'
    }), 201

@s2s_bp.route('/profiles/<profile_id>', methods=['GET'])
def get_profile(profile_id):
    \"\"\"
    Get an applicant profile by ID.
    \"\"\"
    # Call Grants.gov service to fetch profile
    profile = grants_service.get_profile(profile_id)
    if profile:
        return jsonify(profile)
    return jsonify({'error': 'Profile not found'}), 404

@s2s_bp.route('/profiles/sam-status/<duns_number>', methods=['GET'])
def check_sam_status(duns_number):
    \"\"\"
    Check SAM registration status for a DUNS number.
    \"\"\"
    status = grants_service.check_sam_status(duns_number)
    return jsonify({'duns_number': duns_number, 'sam_status': status})

@s2s_bp.route('/submit-opportunity', methods=['POST'])
def submit_opportunity():
    \"\"\"
    Submit a new grant opportunity (for grantors).
    \"\"\"
    data = request.get_json()
    # Implementation to submit a new opportunity to Grants.gov
    return jsonify({'status': 'success', 'message': 'Opportunity submitted successfully'}), 201

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)