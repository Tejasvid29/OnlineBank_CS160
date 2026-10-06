from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    supabase_url: str
    supabase_key: str
    cors_origins: str = "http://localhost:8081,http://localhost:19006"


settings = Settings()
