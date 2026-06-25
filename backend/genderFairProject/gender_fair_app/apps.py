from django.apps import AppConfig


class GenderFairAppConfig(AppConfig):
    name = 'gender_fair_app'
    default_auto_field = 'django.db.models.BigAutoField'
    
    def ready(self):
        """Defer dataset loading until runtime instead of during app initialization."""
        # Dataset is loaded lazily by analyze_text() or by the management command
        # to avoid database access during AppConfig.ready().
        pass
