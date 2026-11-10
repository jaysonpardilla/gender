from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gender_fair_app', '0008_userprofile_roles'),
    ]

    operations = [
        migrations.AlterField(
            model_name='biasedwordmapping',
            name='biased_word',
            field=models.CharField(db_index=True, max_length=255),
        ),
        migrations.AddConstraint(
            model_name='biasedwordmapping',
            constraint=models.UniqueConstraint(
                fields=('biased_word', 'fair_word'),
                name='unique_biased_word_fair_word',
            ),
        ),
        migrations.AlterModelOptions(
            name='biasedwordmapping',
            options={'ordering': ['biased_word', 'id']},
        ),
    ]
