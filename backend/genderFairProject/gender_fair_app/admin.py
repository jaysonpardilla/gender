from django.contrib import admin
from .models import UserProfile, Document, BiasedWordMapping


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'role', 'created_at']
    list_filter = ['role', 'created_at']
    search_fields = ['user__email', 'user__first_name']


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'user', 'file_type', 'created_at']
    list_filter = ['file_type', 'created_at']
    search_fields = ['user__email', 'file_name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(BiasedWordMapping)
class BiasedWordMappingAdmin(admin.ModelAdmin):
    list_display = ['biased_word', 'fair_word', 'category']
    list_filter = ['category']
    search_fields = ['biased_word', 'fair_word']
    ordering = ['biased_word']

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        BiasedWordMapping.objects.filter(biased_word=obj.biased_word).update(category=obj.category)
        self.clear_dataset_cache()

    def delete_model(self, request, obj):
        super().delete_model(request, obj)
        self.clear_dataset_cache()

    def delete_queryset(self, request, queryset):
        super().delete_queryset(request, queryset)
        self.clear_dataset_cache()

    @staticmethod
    def clear_dataset_cache():
        from django.core.cache import cache

        for key in (
            'gender_fair_dataset',
            'gender_fair_dataset_alternatives',
            'gender_fair_dataset_categories',
        ):
            cache.delete(key)
