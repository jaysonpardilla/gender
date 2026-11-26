from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gender_fair_app', '0011_document_gender_level_continuum'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='department',
            field=models.CharField(
                blank=True,
                choices=[
                    ('SAS', 'SAS'),
                    ('STCS', 'STCS'),
                    ('SCJE', 'SCJE'),
                    ('SME', 'SME'),
                    ('SOE', 'SOE'),
                    ('STED', 'STED'),
                    ('SNHS', 'SNHS'),
                ],
                default='',
                max_length=4,
            ),
        ),
    ]
