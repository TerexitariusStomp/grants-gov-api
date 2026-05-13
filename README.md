# Grants.gov API

A comprehensive API for searching and applying for federal grant opportunities.

## Features

- **Opportunity Search**: Search and filter grant opportunities from Grants.gov
- **Business Profiles**: Create and manage business profiles with SAM registration
- **Grant Applications**: Submit grant applications directly through the API
- **SAM Integration**: Check and sync SAM registration status
- **Automated Caching**: Fresh opportunity data cached daily

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Configure environment variables in `.env`:
   ```env
   DATABASE_URL=postgresql://user:pass@localhost:5432/grants_db
   SECRET_KEY=your-secret-key
   SAM_API_KEY=your-sam-api-key
   GRANTS_GOV_API_KEY=your-grants-gov-api-key
   ```
4. Run the application:
   ```bash
   uvicorn app.main:app --reload
   ```

## API Endpoints

### Opportunities
- `GET /api/v1/opportunities/` - Search grant opportunities
- `GET /api/v1/opportunities/{opportunity_number}` - Get opportunity details
- `POST /api/v1/opportunities/apply/{opportunity_number}` - Submit application

### Profiles
- `POST /api/v1/profiles/` - Create business profile
- `GET /api/v1/profiles/` - List all profiles
- `GET /api/v1/profiles/{profile_id}` - Get profile details
- `PUT /api/v1/profiles/{profile_id}` - Update profile
- `GET /api/v1/profiles/sam-status/{duns_number}` - Check SAM status
- `GET /api/v1/profiles/sync-sam/{profile_id}` - Sync SAM status

### Applications
- `GET /api/v1/applications/` - List all applications
- `GET /api/v1/applications/{application_id}` - Get application details
- `PUT /api/v1/applications/{application_id}/status` - Update application status
- `GET /api/v1/applications/profile/{profile_id}` - Get applications by profile

## Authentication

The API uses JWT token authentication. To get a token:

```bash
POST /login
Content-Type: application/json

{
    "username": "admin",
    "password": "password123"
}
```

Include the token in the Authorization header:
```
Authorization: Bearer <token>
```

## Data Models

### Profile
- DUNS Number
- Business Name
- Address
- Contact Information
- SAM Status
- NAICS Codes
- Certifications

### Opportunity
- Opportunity Number
- Title
- Agency
- Category
- Description
- Closing Date
- Award Amount
- Eligibility

### Application
- Opportunity Number
- Business Profile
- Application Data
- Documents
- Status

## Integration

The API integrates with:
- **Grants.gov**: Opportunity data feed
- **SAM.gov**: Business registration verification

## Development

### Requirements
- Python 3.8+
- PostgreSQL
- Grants.gov API Key
- SAM.gov API Key

### Environment Variables
- `DATABASE_URL`: Database connection string
- `SECRET_KEY`: JWT secret key
- `SAM_API_KEY`: SAM.gov API key
- `GRANTS_GOV_API_KEY`: Grants.gov API key

## Testing

Run tests with:
```bash
pytest tests/
```

## Deployment

The API can be deployed using:
- Docker
- Gunicorn
- Uvicorn with systemd
- Cloud providers (AWS, GCP, Azure)

## License

MIT