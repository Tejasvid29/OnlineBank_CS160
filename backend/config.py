from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str
    supabase_jwks_url: str = ""
    # Free key from geoapify.com. Server-side only; ATM search returns 503 until it is set.
    geoapify_api_key: str = ""
    check_deposit_bucket: str = "check-deposits"
    # Where the password-reset email link sends the user. Must also be in Supabase's Redirect URLs.
    app_url: str = "http://localhost:8081"
    cors_origins: str = "http://localhost:8081,http://localhost:19006"


settings = Settings()
