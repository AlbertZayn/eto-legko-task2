from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    keitaro_base_url: str = "https://tlgk.host/admin_api/v1"
    keitaro_api_key: str = ""
    keitaro_domain_id: int = 1813
    keitaro_group_id: int = 10332
    keitaro_source_id: int = 836
    database_url: str = "sqlite:///./adrobot.db"
    campaign_name_prefix: str = "test_zaynullin_"


@lru_cache
def get_settings() -> Settings:
    return Settings()
