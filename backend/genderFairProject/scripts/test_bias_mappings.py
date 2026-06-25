import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','genderFairProject.settings')
import django
django.setup()
from django.test import RequestFactory
from gender_fair_app.views import bias_mappings_view
req = RequestFactory().get('/api/bias-mappings/')
resp = bias_mappings_view(req)
print('status:', resp.status_code)
if hasattr(resp, 'data'):
    data = resp.data
    print('count:', len(data))
    print('sample:', data[:5])
else:
    print('no data attr; content length', len(resp.content))
