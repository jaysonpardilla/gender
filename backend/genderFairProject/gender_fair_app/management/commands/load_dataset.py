from django.core.management.base import BaseCommand
from gender_fair_app.utils import load_dataset_to_db
from gender_fair_app.models import BiasedWordMapping


class Command(BaseCommand):
    help = 'Load the gender-fair dataset from Excel file into the database'

    def handle(self, *args, **options):
        self.stdout.write('Loading dataset...')
        
        initial_count = BiasedWordMapping.objects.count()
        
        try:
            load_dataset_to_db()
            final_count = BiasedWordMapping.objects.count()
            
            if final_count > initial_count:
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Successfully loaded {final_count - initial_count} new mappings. '
                        f'Total mappings: {final_count}'
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f'Dataset already loaded. Total mappings: {final_count}'
                    )
                )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error loading dataset: {str(e)}')
            )
