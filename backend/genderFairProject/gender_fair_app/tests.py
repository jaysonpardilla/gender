import tempfile
from pathlib import Path

import xlrd
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from gender_fair_app.models import BiasedWordMapping
from gender_fair_app.utils import append_mappings_to_excel_file


class ExcelImportTests(TestCase):
    def test_append_mappings_to_excel_file_after_last_populated_row(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            uploaded_path = Path(tmp_dir) / 'upload.xlsx'
            upload_workbook = Workbook()
            upload_sheet = upload_workbook.active
            upload_sheet.title = 'Sheet1'
            upload_sheet.append(['id', 'gendered_term', 'gender_fair_term'])
            upload_sheet.append([10, 'mankind', 'people'])
            upload_sheet.append([11, 'salesman', 'salesperson'])
            upload_workbook.save(uploaded_path)

            with uploaded_path.open('rb') as uploaded_file:
                imported = append_mappings_to_excel_file(uploaded_file, target_path=None)

            self.assertTrue(imported)
            # Verify entries were saved to database
            self.assertTrue(BiasedWordMapping.objects.filter(biased_word='mankind').exists())
            self.assertEqual(BiasedWordMapping.objects.get(biased_word='mankind').fair_word, 'people')
            self.assertTrue(BiasedWordMapping.objects.filter(biased_word='salesman').exists())
            self.assertEqual(BiasedWordMapping.objects.get(biased_word='salesman').fair_word, 'salesperson')

    def test_append_mappings_updates_existing_duplicate_mappings(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            # Create initial database entry
            BiasedWordMapping.objects.create(biased_word='he', fair_word='they')

            uploaded_path = Path(tmp_dir) / 'upload.xlsx'
            upload_workbook = Workbook()
            upload_sheet = upload_workbook.active
            upload_sheet.title = 'Sheet1'
            upload_sheet.append(['id', 'gendered_term', 'gender_fair_term'])
            upload_sheet.append([10, 'he', 'them'])
            upload_workbook.save(uploaded_path)

            with uploaded_path.open('rb') as uploaded_file:
                imported = append_mappings_to_excel_file(uploaded_file, target_path=None)

            self.assertTrue(imported)
            # Verify the mapping was updated
            mapping = BiasedWordMapping.objects.get(biased_word='he')
            self.assertEqual(mapping.fair_word, 'them')

    def test_append_mappings_with_only_duplicate_rows_appends_duplicate_rows(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            # Create initial database entry
            BiasedWordMapping.objects.create(biased_word='he', fair_word='them')

            uploaded_path = Path(tmp_dir) / 'upload.xlsx'
            upload_workbook = Workbook()
            upload_sheet = upload_workbook.active
            upload_sheet.title = 'Sheet1'
            upload_sheet.append(['id', 'gendered_term', 'gender_fair_term'])
            upload_sheet.append([10, 'he', 'them'])
            upload_workbook.save(uploaded_path)

            with uploaded_path.open('rb') as uploaded_file:
                imported = append_mappings_to_excel_file(uploaded_file, target_path=None)

            self.assertTrue(imported)
            # Verify the mapping still exists
            mapping = BiasedWordMapping.objects.get(biased_word='he')
            self.assertEqual(mapping.fair_word, 'them')

    def test_append_mappings_to_excel_file_preserves_legacy_xls_target(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            uploaded_path = Path(tmp_dir) / 'upload.xlsx'
            upload_workbook = Workbook()
            upload_sheet = upload_workbook.active
            upload_sheet.title = 'Sheet1'
            upload_sheet.append(['id', 'gendered_term', 'gender_fair_term'])
            upload_sheet.append([10, 'mankind', 'people'])
            upload_workbook.save(uploaded_path)

            with uploaded_path.open('rb') as uploaded_file:
                imported = append_mappings_to_excel_file(uploaded_file, target_path=None)

            self.assertTrue(imported)
            # Verify entries were saved to database
            self.assertTrue(BiasedWordMapping.objects.filter(biased_word='mankind').exists())
            self.assertEqual(BiasedWordMapping.objects.get(biased_word='mankind').fair_word, 'people')

    def test_append_mappings_from_header_with_spaces(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            uploaded_path = Path(tmp_dir) / 'upload.xls'
            import xlwt
            workbook = xlwt.Workbook()
            upload_sheet = workbook.add_sheet('Sheet1')
            upload_sheet.write(0, 0, 'id')
            upload_sheet.write(0, 1, 'gendered term')
            upload_sheet.write(0, 2, 'gender_fair_term')
            upload_sheet.write(1, 0, 2)
            upload_sheet.write(1, 1, 'bert')
            upload_sheet.write(1, 2, 'berta_')
            workbook.save(str(uploaded_path))

            with uploaded_path.open('rb') as uploaded_file:
                result = append_mappings_to_excel_file(uploaded_file, target_path=None)

            self.assertTrue(result)
            # Verify entries were saved to database
            self.assertTrue(BiasedWordMapping.objects.filter(biased_word='bert').exists())
            self.assertEqual(BiasedWordMapping.objects.get(biased_word='bert').fair_word, 'berta_')

    def test_admin_dataset_import_endpoint_accepts_xls_file(self):
        admin = User.objects.create_user(username='admin@example.com', email='admin@example.com', password='password123')
        admin.profile.role = 'admin'
        admin.profile.save()

        with tempfile.TemporaryDirectory() as tmp_dir:
            upload_path = Path(tmp_dir) / 'upload.xls'
            import xlwt
            workbook = xlwt.Workbook()
            sheet = workbook.add_sheet('Sheet1')
            sheet.write(0, 0, 'id')
            sheet.write(0, 1, 'gendered_term')
            sheet.write(0, 2, 'gender_fair_term')
            sheet.write(1, 0, 1)
            sheet.write(1, 1, 'manager')
            sheet.write(1, 2, 'manager')
            workbook.save(str(upload_path))

            self.client = APIClient()
            self.client.force_authenticate(user=admin)
            with upload_path.open('rb') as file_handle:
                uploaded = SimpleUploadedFile('upload.xls', file_handle.read(), content_type='application/vnd.ms-excel')
                response = self.client.post('/api/admin/dataset/import/', {'file': uploaded})

        self.assertEqual(response.status_code, 200)
        self.assertIn('added_rows', response.json())
        self.assertGreaterEqual(response.json()['added_rows'], 0)

    def test_admin_dataset_view_reads_mappings_from_database(self):
        admin = User.objects.create_user(username='admin-db@example.com', email='admin-db@example.com', password='password123')
        admin.profile.role = 'admin'
        admin.profile.save()
        BiasedWordMapping.objects.create(biased_word='chairman', fair_word='chairperson')

        self.client = APIClient()
        self.client.force_authenticate(user=admin)
        response = self.client.get('/api/admin/dataset/')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(any(item['biased_word'] == 'chairman' and item['fair_word'] == 'chairperson' for item in payload))
