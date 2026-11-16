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
    # Resend API key for emails the backend sends itself (e.g. the account-locked notice). Unset = those emails are skipped.
    resend_api_key: str = ""
    mail_from: str = "OnlineBank <onboarding@resend.dev>"
    # Optional SMTP (e.g. Gmail: smtp.gmail.com, 465, an app password). When SMTP_HOST is set it is used instead of Resend.
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    # How often the backend looks for month-end statements to email. 0 turns the check off.
    statement_email_interval_seconds: int = 600
    cors_origins: str = "http://localhost:8081,http://localhost:19006"


settings = Settings()
