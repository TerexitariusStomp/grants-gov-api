import requests
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.schemas.opportunity import OpportunityResponse
from app.core.config import settings

class GrantsGovService:
    """Service for interacting with Grants.gov S2S API."""

    def __init__(self):
        self.base_url = "https://api.grants.gov/v1"
        self.headers = {
            "Content-Type": "application/json"
        }

    def search_opportunities(self, filters: Dict[str, Any]) -> List[OpportunityResponse]:
        """Search for grant opportunities via Grants.gov S2S API."""
        try:
            params = {}
            if filters.get("query"):
                params["query"] = filters["query"]
            if filters.get("agency"):
                params["agency"] = filters["agency"]
            if filters.get("category"):
                params["category"] = filters["category"]
            if filters.get("limit"):
                params["limit"] = filters["limit"]
            if filters.get("offset"):
                params["offset"] = filters["offset"]

            response = requests.get(
                f"{self.base_url}/opportunities",
                headers=self.headers,
                params=params,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()

            opportunities = []
            for item in data.get("opportunities", []):
                opportunity = OpportunityResponse(
                    id=item.get("id"),
                    opportunity_number=item.get("opportunity_number"),
                    title=item.get("title", ""),
                    agency=item.get("agency", ""),
                    description=item.get("description", ""),
                    award_ceiling=item.get("award_ceiling", ""),
                    close_date=item.get("close_date", ""),
                    category=item.get("category", ""),
                    funding_opportunity_number=item.get("funding_opportunity_number", ""),
                )
                opportunities.append(opportunity)

            return opportunities
        except Exception as e:
            print(f"Error calling Grants.gov API: {e}")
            raise

    def get_opportunity_by_number(self, opportunity_number: str):
        """Get a specific opportunity by its number from Grants.gov API."""
        try:
            response = requests.get(
                f"{self.base_url}/opportunities/{opportunity_number}",
                headers=self.headers,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            return OpportunityResponse(**data)
        except Exception as e:
            print(f"Error fetching opportunity {opportunity_number}: {e}")
            raise

    def get_profile(self, duns_number: str):
        # Implementation to fetch business profile from SAM.gov (separate API)
        raise NotImplementedError("get_profile not implemented")

    def check_sam_status(self, duns_number: str) -> str:
        # Implementation to check SAM registration status
        raise NotImplementedError("check_sam_status not implemented")

    def submit_application(self, opportunity_number: str, application_data: Dict):
        """Submit grant application via Grants.gov S2S API."""
        try:
            response = requests.post(
                f"{self.base_url}/applications",
                json={
                    "opportunity_number": opportunity_number,
                    "application_data": application_data
                },
                headers=self.headers,
                timeout=60
            )
            response.raise_for_status()
            return True
        except Exception as e:
            print(f"Error submitting application: {e}")
            raise