import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','genderFairProject.settings')
import sys
import django
# Ensure project root is on sys.path so Django settings module imports correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
django.setup()
from gender_fair_app.utils import analyze_text

sample = "The policeman and the chairman informed his employees that each salesman should submit his report on time. The anchorman and assemblywoman attended."
res = analyze_text(sample)
print('detected count:', len(res['detected_words']))
print('detected words:', res['detected_words'])
print('replacements sample:', list(res['replacements'].items())[:10])
print('\nprocessed_text:\n', res['processed_text'])
