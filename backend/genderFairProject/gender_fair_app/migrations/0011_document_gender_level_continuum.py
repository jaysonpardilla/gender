import json
import re

from django.db import migrations, models


def backfill_gender_level_metrics(apps, schema_editor):
    Document = apps.get_model('gender_fair_app', 'Document')
    database = schema_editor.connection.alias

    for document in Document.objects.using(database).all().iterator():
        text = document.original_text or ''
        word_count = len(re.findall(r'\b[\w\-]+\b', text))
        detected_words = document.detected_words

        if isinstance(detected_words, str):
            try:
                detected_words = json.loads(detected_words)
            except (json.JSONDecodeError, TypeError):
                detected_words = [detected_words]
        if isinstance(detected_words, dict):
            detected_words = [
                detected_words.get('word')
                or detected_words.get('biased_word')
                or detected_words.get('original')
            ]
        if not isinstance(detected_words, list):
            detected_words = [detected_words] if detected_words else []

        terms = []
        for item in detected_words:
            if isinstance(item, dict):
                term = item.get('word') or item.get('biased_word') or item.get('original')
            else:
                term = item
            if term:
                terms.append(str(term))

        occupied = [False] * len(text)
        occurrence_count = 0
        for term in sorted(terms, key=len, reverse=True):
            pattern = re.compile(r'\b' + re.escape(term) + r'\b', re.IGNORECASE)
            for match in pattern.finditer(text):
                start, end = match.span()
                if any(occupied[start:end]):
                    continue
                occurrence_count += 1
                for position in range(start, end):
                    occupied[position] = True

        percentage = occurrence_count * 100 / word_count if word_count else 0
        if occurrence_count * 100 <= word_count * 20:
            classification = 'gender_blind'
        elif occurrence_count * 100 <= word_count * 40:
            classification = 'gender_aware'
        elif occurrence_count * 100 <= word_count * 60:
            classification = 'gender_sensitive'
        elif occurrence_count * 100 <= word_count * 80:
            classification = 'gender_responsive'
        else:
            classification = 'gender_transformative'

        document.total_word_count = word_count
        document.total_detected_biased_word_occurrences = occurrence_count
        document.gender_bias_percentage = percentage
        document.gender_level_classification = classification
        document.save(
            update_fields=[
                'total_word_count',
                'total_detected_biased_word_occurrences',
                'gender_bias_percentage',
                'gender_level_classification',
            ]
        )


class Migration(migrations.Migration):

    dependencies = [
        ('gender_fair_app', '0010_biasedwordmapping_category_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='document',
            name='total_word_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='document',
            name='total_detected_biased_word_occurrences',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='document',
            name='gender_bias_percentage',
            field=models.FloatField(default=0.0),
        ),
        migrations.AddField(
            model_name='document',
            name='gender_level_classification',
            field=models.CharField(blank=True, choices=[('gender_blind', 'Gender Blind'), ('gender_aware', 'Gender Aware'), ('gender_sensitive', 'Gender Sensitive'), ('gender_responsive', 'Gender Responsive'), ('gender_transformative', 'Gender Transformative')], default='', max_length=32),
        ),
        migrations.RunPython(backfill_gender_level_metrics, migrations.RunPython.noop),
    ]
