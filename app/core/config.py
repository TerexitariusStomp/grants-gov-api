from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = ""
    secret_key: str = ""
    sam_api_key: str = ""
    grants_gov_api_key: str = ""
    
    class Config:
        env_file = "../.env"

settings = Settings()