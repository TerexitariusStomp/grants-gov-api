#!/bin/bash
# Start Grants.gov API server

cd /root/grants_api

# Check if .env file exists, create if not
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOF
DATABASE_URL=sqlite:///./grants.db
SECRET_KEY=change_this_secret_key_in_production
SAM_API_KEY=your_sam_api_key_here
GRANTS_GOV_API_KEY=your_grants_gov_api_key_here
EOF
    echo "Created .env file. Remember to update with your actual API keys!"
fi

# Start the server
echo "Starting Grants.gov API server..."
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

echo "Server started! Visit http://localhost:8000/docs for API documentation"