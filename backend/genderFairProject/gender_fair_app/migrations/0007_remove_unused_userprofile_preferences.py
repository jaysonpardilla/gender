from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('gender_fair_app', '0006_remove_userprofile_auto_save_analysis_and_more'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='userprofile',
            name='theme_preference',
        ),
        migrations.RemoveField(
            model_name='userprofile',
            name='auto_save_enabled',
        ),
        migrations.RemoveField(
            model_name='userprofile',
            name='email_notifications_enabled',
        ),
        migrations.RemoveField(
            model_name='userprofile',
            name='ai_analysis_enabled',
        ),
        migrations.RemoveField(
            model_name='userprofile',
            name='two_factor_enabled',
        ),
    ]
