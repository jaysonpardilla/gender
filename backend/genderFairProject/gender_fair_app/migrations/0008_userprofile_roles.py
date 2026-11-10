from django.db import migrations, models


def migrate_legacy_user_roles(apps, schema_editor):
    UserProfile = apps.get_model('gender_fair_app', 'UserProfile')
    UserProfile.objects.filter(role='user').update(role='student')


def restore_legacy_user_roles(apps, schema_editor):
    UserProfile = apps.get_model('gender_fair_app', 'UserProfile')
    UserProfile.objects.filter(role__in=['student', 'faculty']).update(role='user')


class Migration(migrations.Migration):

    dependencies = [
        ('gender_fair_app', '0007_remove_unused_userprofile_preferences'),
    ]

    operations = [
        migrations.RunPython(migrate_legacy_user_roles, restore_legacy_user_roles),
        migrations.AlterField(
            model_name='userprofile',
            name='role',
            field=models.CharField(
                choices=[('student', 'Student'), ('faculty', 'Faculty'), ('admin', 'Admin')],
                default='student',
                max_length=10,
            ),
        ),
    ]
