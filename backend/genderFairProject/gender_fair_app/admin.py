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
    list_display = ['biased_word', 'fair_word']
    search_fields = ['biased_word', 'fair_word']
    ordering = ['biased_word']

