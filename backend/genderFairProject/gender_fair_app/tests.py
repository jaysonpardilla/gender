from unittest.mock import patch
import tempfile
import io
from pathlib import Path

import xlrd
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from docx import Document as DocxDocument
from docx.shared import Pt, RGBColor
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from gender_fair_app.docx_handler import modify_docx_with_replacements
from gender_fair_app.models import BiasedWordMapping, Document, UserProfile
from gender_fair_app.utils import analyze_text, append_mappings_to_excel_file, modify_pdf_with_replacements


class SignupTests(TestCase):
    def test_signup_creates_profile_for_each_role(self):
        for role in ('student', 'faculty', 'admin'):
            with self.subTest(role=role):
                response = self.client.post(
                    '/api/auth/signup/',
                    {
                        'email': f'new-{role}@example.com',
                        'first_name': 'New',
                        'last_name': role.title(),
                        'password': 'password123',
                        'password_confirm': 'password123',
                        'role': role,
                    },
                    format='json',
                )

                self.assertEqual(response.status_code, 201)
                user = User.objects.get(email=f'new-{role}@example.com')
                profile = UserProfile.objects.get(user=user)
                self.assertEqual(profile.role, role)

    def test_signup_ignores_invalid_authentication_header(self):
        response = self.client.post(
            '/api/auth/signup/',
            {
                'email': 'new-student@example.com',
                'first_name': 'New',
                'last_name': 'Student',
                'password': 'password123',
                'password_confirm': 'password123',
                'role': 'student',
            },
            format='json',
            HTTP_AUTHORIZATION='Bearer invalid-token',
        )

        self.assertEqual(response.status_code, 201)

    def test_signup_rejects_legacy_user_role(self):
        response = self.client.post(
            '/api/auth/signup/',
            {
                'email': 'legacy-user@example.com',
                'first_name': 'Legacy',
                'last_name': 'User',
                'password': 'password123',
                'password_confirm': 'password123',
                'role': 'user',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)


class AdminUserDeletionTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin-delete-user@example.com',
            email='admin-delete-user@example.com',
            password='password123',
        )
        self.admin.profile.role = 'admin'
        self.admin.profile.save()
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_admin_can_delete_user_and_associated_records(self):
        target = User.objects.create_user(
            username='test-user@example.com',
            email='test-user@example.com',
            password='password123',
        )
        document = Document.objects.create(
            user=target,
            original_text='Original',
            processed_text='Processed',
        )

        response = self.client.delete(f'/api/admin/users/{target.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(id=target.id).exists())
        self.assertFalse(Document.objects.filter(id=document.id).exists())

    def test_non_admin_cannot_delete_users(self):
        student = User.objects.create_user(
            username='student-delete-user@example.com',
            email='student-delete-user@example.com',
            password='password123',
        )
        target = User.objects.create_user(
            username='target-user@example.com',
            email='target-user@example.com',
            password='password123',
        )
        self.client.force_authenticate(user=student)

        response = self.client.delete(f'/api/admin/users/{target.id}/')

        self.assertEqual(response.status_code, 403)
        self.assertTrue(User.objects.filter(id=target.id).exists())

    def test_admin_cannot_delete_own_account(self):
        response = self.client.delete(f'/api/admin/users/{self.admin.id}/')

        self.assertEqual(response.status_code, 400)
        self.assertTrue(User.objects.filter(id=self.admin.id).exists())


class ExcelImportTests(TestCase):
    def test_analysis_returns_all_alternatives_with_first_as_default(self):
        BiasedWordMapping.objects.create(biased_word='policeman', fair_word='police officer')
        BiasedWordMapping.objects.create(biased_word='policeman', fair_word='police person')
        cache.delete('gender_fair_dataset')
        cache.delete('gender_fair_dataset_alternatives')

        result = analyze_text('Policeman arrived.')

        self.assertEqual(result['replacements']['Policeman'], 'Police officer')
        self.assertEqual(
            result['replacement_alternatives']['Policeman'],
            ['Police officer', 'Police person'],
        )

    def test_analysis_matches_replacement_case_to_detected_term(self):
        BiasedWordMapping.objects.create(biased_word='chairman', fair_word='chairperson')
        cache.delete('gender_fair_dataset')
        cache.delete('gender_fair_dataset_alternatives')
        cache.delete('gender_fair_dataset_categories')

        result = analyze_text('chairman CHAIRMAN Chairman')

        self.assertEqual(
            result['replacements'],
            {
                'chairman': 'chairperson',
                'CHAIRMAN': 'CHAIRPERSON',
                'Chairman': 'Chairperson',
            },
        )
        self.assertEqual(
            result['replacement_alternatives'],
            {
                'chairman': ['chairperson'],
                'CHAIRMAN': ['CHAIRPERSON'],
                'Chairman': ['Chairperson'],
            },
        )
        self.assertEqual(result['processed_text'], 'chairperson CHAIRPERSON Chairperson')

    def test_analysis_endpoints_include_all_alternatives(self):
        user = User.objects.create_user(username='analysis-alternatives@example.com', password='password123')
        BiasedWordMapping.objects.create(
            biased_word='chairman',
            fair_word='chairperson',
            category='gendered_occupational_term',
        )
        BiasedWordMapping.objects.create(
            biased_word='chairman',
            fair_word='chair',
            category='gendered_occupational_term',
        )
        cache.delete('gender_fair_dataset')
        cache.delete('gender_fair_dataset_alternatives')
        cache.delete('gender_fair_dataset_categories')
        self.client = APIClient()
        self.client.force_authenticate(user=user)

        text_response = self.client.post('/api/analyze-text/', {'text': 'The chairman spoke.'}, format='json')
        file_response = self.client.post(
            '/api/upload-document/',
            {'file': SimpleUploadedFile('sample.txt', b'The chairman spoke.', content_type='text/plain')},
            format='multipart',
        )

        expected = ['chairperson', 'chair']
        self.assertEqual(text_response.status_code, 200)
        self.assertEqual(text_response.data['replacement_alternatives']['chairman'], expected)
        self.assertEqual(
            text_response.data['detected_term_categories']['chairman'],
            'gendered_occupational_term',
        )
        self.assertEqual(file_response.status_code, 200)
        self.assertEqual(file_response.data['replacement_alternatives']['chairman'], expected)
        self.assertEqual(
            file_response.data['detected_term_categories']['chairman'],
            'gendered_occupational_term',
        )
        self.assertEqual(
            Document.objects.get(id=text_response.data['document_id']).detected_term_categories,
            {'chairman': 'gendered_occupational_term'},
        )
        self.assertEqual(
            Document.objects.get(id=file_response.data['document_id']).detected_term_categories,
            {'chairman': 'gendered_occupational_term'},
        )

    def test_admin_can_add_multiple_alternatives_in_one_request(self):
        admin = User.objects.create_user(username='admin-batch@example.com', email='admin-batch@example.com', password='password123')
        admin.profile.role = 'admin'
        admin.profile.save()
        self.client = APIClient()
        self.client.force_authenticate(user=admin)

        with patch('gender_fair_app.utils.append_mapping_to_excel', return_value=True):
            response = self.client.post(
                '/api/admin/dataset/',
                {
                    'biased_word': 'policeman',
                    'fair_words': ['police officer', 'police person'],
                    'category': 'gendered_occupational_term',
                },
                format='json',
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.data['mappings']), 2)
        self.assertEqual(
            {mapping['category'] for mapping in response.data['mappings']},
            {'gendered_occupational_term'},
        )
        self.assertEqual(
            list(
                BiasedWordMapping.objects.filter(biased_word='policeman')
                .order_by('id')
                .values_list('fair_word', flat=True)
            ),
            ['police officer', 'police person'],
        )
        self.assertSetEqual(
            set(BiasedWordMapping.objects.filter(biased_word='policeman').values_list('category', flat=True)),
            {'gendered_occupational_term'},
        )

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

    def test_import_splits_comma_separated_alternatives_and_reads_category(self):
        admin = User.objects.create_user(
            username='admin-excel-category@example.com',
            email='admin-excel-category@example.com',
            password='password123',
        )
        admin.profile.role = 'admin'
        admin.profile.save()

        with tempfile.TemporaryDirectory() as tmp_dir:
            upload_path = Path(tmp_dir) / 'upload.xlsx'
            workbook = Workbook()
            sheet = workbook.active
            sheet.append(['biased_word', 'fair_word', 'category'])
            sheet.append(['policeman', 'police officer, police person', 'Gendered occupational term'])
            workbook.save(upload_path)

            self.client = APIClient()
            self.client.force_authenticate(user=admin)
            with upload_path.open('rb') as file_handle:
                uploaded = SimpleUploadedFile(
                    'upload.xlsx',
                    file_handle.read(),
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                )
                response = self.client.post('/api/admin/dataset/import/', {'file': uploaded})

        self.assertEqual(response.status_code, 200)
        mappings = BiasedWordMapping.objects.filter(biased_word='policeman')
        self.assertSetEqual(
            set(mappings.values_list('fair_word', flat=True)),
            {'police officer', 'police person'},
        )
        self.assertSetEqual(
            set(mappings.values_list('category', flat=True)),
            {'gendered_occupational_term'},
        )
        self.assertEqual(response.data['imported_rows'], 2)

    def test_append_mappings_preserves_alternative_for_existing_biased_word(self):
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
            self.assertSetEqual(
                set(BiasedWordMapping.objects.filter(biased_word='he').values_list('fair_word', flat=True)),
                {'they', 'them'},
            )

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
            self.assertEqual(BiasedWordMapping.objects.filter(biased_word='he', fair_word='them').count(), 1)

    def test_admin_can_add_multiple_fair_alternatives_for_same_biased_word(self):
        admin = User.objects.create_user(username='admin-dataset@example.com', email='admin-dataset@example.com', password='password123')
        admin.profile.role = 'admin'
        admin.profile.save()

        self.client = APIClient()
        self.client.force_authenticate(user=admin)
        with patch('gender_fair_app.utils.append_mapping_to_excel', return_value=True):
            first_response = self.client.post(
                '/api/admin/dataset/',
                {
                    'biased_word': 'policeman',
                    'fair_word': 'police officer',
                    'category': 'gendered_occupational_term',
                },
                format='json',
            )
            second_response = self.client.post(
                '/api/admin/dataset/',
                {'biased_word': 'policeman', 'fair_word': 'police person'},
                format='json',
            )
            duplicate_response = self.client.post(
                '/api/admin/dataset/',
                {'biased_word': 'policeman', 'fair_word': 'police officer'},
                format='json',
            )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(duplicate_response.status_code, 200)
        self.assertTrue(duplicate_response.data['is_duplicate'])
        self.assertSetEqual(
            set(BiasedWordMapping.objects.filter(biased_word='policeman').values_list('fair_word', flat=True)),
            {'police officer', 'police person'},
        )
        self.assertSetEqual(
            set(BiasedWordMapping.objects.filter(biased_word='policeman').values_list('category', flat=True)),
            {'gendered_occupational_term'},
        )
        dataset_response = self.client.get('/api/admin/dataset/')
        self.assertEqual(dataset_response.status_code, 200)
        self.assertEqual(
            {
                item['fair_word']
                for item in dataset_response.data
                if item['biased_word'] == 'policeman'
            },
            {'police officer', 'police person'},
        )
        self.assertEqual(
            [item['fair_word'] for item in dataset_response.data],
            ['police person', 'police officer'],
        )
        self.assertTrue(all(item['category'] == 'gendered_occupational_term' for item in dataset_response.data))

    def test_admin_can_delete_classified_mapping(self):
        admin = User.objects.create_user(username='admin-delete-category@example.com', password='password123')
        admin.profile.role = 'admin'
        admin.profile.save()
        mapping = BiasedWordMapping.objects.create(
            biased_word='chairman',
            fair_word='chairperson',
            category='gender_stereotype',
        )
        cache.set('gender_fair_dataset_categories', {'chairman': 'gender_stereotype'}, 3600)
        self.client = APIClient()
        self.client.force_authenticate(user=admin)

        response = self.client.delete(f'/api/admin/dataset/{mapping.id}/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(BiasedWordMapping.objects.filter(id=mapping.id).exists())
        self.assertNotIn('chairman', cache.get('gender_fair_dataset_categories') or {})

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


class DocumentFormattingTests(TestCase):
    def test_docx_replacement_preserves_lower_upper_and_capitalized_case(self):
        source = DocxDocument()
        source.add_paragraph('chairman CHAIRMAN Chairman')

        original_bytes = io.BytesIO()
        source.save(original_bytes)
        modified_bytes, _ = modify_docx_with_replacements(
            original_bytes.getvalue(),
            [{'original': 'chairman', 'replacement': 'Chairperson', 'approved': True}],
        )

        modified = DocxDocument(modified_bytes)
        self.assertEqual(
            modified.paragraphs[0].text,
            'chairperson CHAIRPERSON Chairperson',
        )

    def test_docx_replacement_preserves_run_font_and_style(self):
        source = DocxDocument()
        paragraph = source.add_paragraph()
        prefix = paragraph.add_run('The ')
        prefix.font.name = 'Arial'
        target = paragraph.add_run('Policeman')
        target.font.name = 'Courier New'
        target.font.size = Pt(16)
        target.font.bold = True
        target.font.italic = True
        target.font.color.rgb = RGBColor(0x12, 0x34, 0x56)
        suffix = paragraph.add_run(' arrived.')
        suffix.font.name = 'Times New Roman'

        original_bytes = io.BytesIO()
        source.save(original_bytes)
        modified_bytes, _ = modify_docx_with_replacements(
            original_bytes.getvalue(),
            [{'original': 'policeman', 'replacement': 'police officer', 'approved': True}],
        )

        modified = DocxDocument(modified_bytes)
        runs = modified.paragraphs[0].runs
        replacement_run = next(run for run in runs if 'police officer' in run.text.lower())
        self.assertEqual(replacement_run.font.name, 'Courier New')
        self.assertEqual(replacement_run.font.size, Pt(16))
        self.assertTrue(replacement_run.font.bold)
        self.assertTrue(replacement_run.font.italic)
        self.assertEqual(replacement_run.font.color.rgb, RGBColor(0x12, 0x34, 0x56))
        self.assertEqual(runs[0].font.name, 'Arial')
        self.assertEqual(runs[-1].font.name, 'Times New Roman')

    def test_pdf_replacement_preserves_lower_upper_and_capitalized_case(self):
        import fitz

        source = fitz.open()
        page = source.new_page()
        page.insert_text((72, 72), 'chairman')
        page.insert_text((72, 100), 'CHAIRMAN')
        page.insert_text((72, 128), 'Chairman')
        original_bytes = source.tobytes()
        source.close()

        modified_bytes = modify_pdf_with_replacements(
            original_bytes,
            [{'original': 'chairman', 'replacement': 'chairperson', 'approved': True}],
        ).getvalue()

        modified = fitz.open(stream=modified_bytes, filetype='pdf')
        self.assertIn('chairperson', modified[0].get_text())
        self.assertIn('CHAIRPERSON', modified[0].get_text())
        self.assertIn('Chairperson', modified[0].get_text())
        modified.close()

    def test_pdf_replacement_preserves_bold_font_and_text_color(self):
        import fitz

        source = fitz.open()
        page = source.new_page()
        page.insert_text((72, 72), 'Policeman', fontname='tibo', fontsize=16, color=(0.1, 0.3, 0.6))
        original_span = page.get_text('dict')['blocks'][0]['lines'][0]['spans'][0]
        original_color = original_span['color']
        original_bytes = source.tobytes()
        source.close()

        modified_bytes = modify_pdf_with_replacements(
            original_bytes,
            [{'original': 'Policeman', 'replacement': 'Police officer', 'approved': True}],
        ).getvalue()

        modified = fitz.open(stream=modified_bytes, filetype='pdf')
        spans = [
            span
            for block in modified[0].get_text('dict')['blocks']
            for line in block.get('lines', [])
            for span in line.get('spans', [])
            if 'police officer' in span['text'].lower()
        ]
        self.assertTrue(spans)
        self.assertEqual(spans[0]['font'], 'Times-Bold')
        self.assertEqual(spans[0]['color'], original_color)
        modified.close()


class AdminAnalyticsTests(TestCase):
    def test_admin_analytics_counts_categories_from_saved_documents(self):
        admin = User.objects.create_user(username='admin-category-analytics@example.com', email='admin-category-analytics@example.com', password='password123')
        admin.profile.role = 'admin'
        admin.profile.save()
        BiasedWordMapping.objects.create(
            biased_word='chairman',
            fair_word='chairperson',
            category='gender_stereotype',
        )
        BiasedWordMapping.objects.create(
            biased_word='salesman',
            fair_word='salesperson',
            category='gendered_occupational_term',
        )
        Document.objects.create(
            user=admin,
            original_text='chairman and salesman',
            processed_text='chairperson and salesperson',
            detected_words=['chairman', 'salesman'],
            detected_term_categories={'chairman': 'gender_stereotype'},
        )
        Document.objects.create(
            user=admin,
            original_text='salesman and unknown',
            processed_text='salesperson and unknown',
            detected_words=['salesman', 'unknown'],
        )
        cache.delete('gender_fair_dataset')
        cache.delete('gender_fair_dataset_categories')

        self.client = APIClient()
        self.client.force_authenticate(user=admin)
        response = self.client.get('/api/admin/analytics/')

        self.assertEqual(response.status_code, 200)
        distribution = {
            item['category_key']: item['count']
            for item in response.data['bias_categories_distribution']
        }
        self.assertEqual(distribution['gender_stereotype'], 1)
        self.assertEqual(distribution['gendered_occupational_term'], 2)
        self.assertEqual(distribution['other'], 1)
        self.assertEqual(response.data['total_detected_terms'], 4)
        self.assertEqual(
            response.data['most_frequently_detected_categories'][0]['category_key'],
            'gendered_occupational_term',
        )

    def test_history_backfills_categories_for_legacy_analysis_records(self):
        user = User.objects.create_user(username='legacy-category-history@example.com', password='password123')
        BiasedWordMapping.objects.create(
            biased_word='chairman',
            fair_word='chairperson',
            category='gendered_occupational_term',
        )
        document = Document.objects.create(
            user=user,
            original_text='chairman',
            processed_text='chairperson',
            detected_words=['chairman'],
        )
        cache.delete('gender_fair_dataset')
        cache.delete('gender_fair_dataset_categories')

        self.client = APIClient()
        self.client.force_authenticate(user=user)
        response = self.client.get('/api/history/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['id'], document.id)
        self.assertEqual(
            response.data[0]['detected_term_categories'],
            {'chairman': 'gendered_occupational_term'},
        )

    def test_admin_analytics_uses_real_document_scores_for_fairness_trend(self):
        admin = User.objects.create_user(username='admin-analytics@example.com', email='admin-analytics@example.com', password='password123')
        admin.profile.role = 'admin'
        admin.profile.save()

        today = timezone.now().date()
        yesterday = today - timezone.timedelta(days=1)

        today_document = Document.objects.create(
            user=admin,
            original_text='Sample text',
            processed_text='Processed text',
            detected_words=['biasword1', 'biasword2', 'biasword3'],
        )
        today_document.created_at = timezone.datetime.combine(today, timezone.datetime.min.time(), tzinfo=timezone.get_current_timezone())
        today_document.save(update_fields=['created_at'])

        yesterday_document = Document.objects.create(
            user=admin,
            original_text='Another sample',
            processed_text='Processed sample',
            detected_words=['biasword1'],
        )
        yesterday_document.created_at = timezone.datetime.combine(yesterday, timezone.datetime.min.time(), tzinfo=timezone.get_current_timezone())
        yesterday_document.save(update_fields=['created_at'])

        self.client = APIClient()
        self.client.force_authenticate(user=admin)
        response = self.client.get('/api/admin/analytics/')

        self.assertEqual(response.status_code, 200)
        trend = response.json()['fairness_score_trend']
        self.assertTrue(any(item['date'] == yesterday.isoformat() for item in trend))
        self.assertTrue(any(item['date'] == today.isoformat() for item in trend))
        self.assertTrue(any(isinstance(item['score'], int) and 0 <= item['score'] <= 100 for item in trend))
