from django.db import models
from django.contrib.auth.models import User
import json

class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('user', 'User'),
        ('admin', 'Admin'),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    avatar = models.CharField(max_length=255, default='default_avatar.png', help_text='Path or URL to avatar')
    bio = models.TextField(blank=True, default='')
    
    # Stats tracking
    analyses_count = models.IntegerField(default=0)
    biased_words_detected = models.IntegerField(default=0)
    average_score = models.FloatField(default=0.0)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.user.email} - {self.role}"
    
    class Meta:
        ordering = ['-created_at']


# Automatically create UserProfile when a User is created
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


class Document(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='documents')
    original_text = models.TextField()
    processed_text = models.TextField()
    detected_words = models.JSONField(default=list, blank=True)  # List of detected biased words
    approved_replacements_count = models.IntegerField(default=0)
    file_name = models.CharField(max_length=255, null=True, blank=True)
    file_type = models.CharField(max_length=10, null=True, blank=True)  # txt, docx, pdf
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.file_name or 'Text Input'} - {self.user.email}"
    
    class Meta:
        ordering = ['-created_at']


class BiasedWordMapping(models.Model):
    """Cache of the gender-fair dataset"""
    biased_word = models.CharField(max_length=255, unique=True, db_index=True)
    fair_word = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.biased_word} → {self.fair_word}"
    
    class Meta:
        ordering = ['biased_word']


class SupportMessage(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='support_messages')
    name = models.CharField(max_length=255)
    email = models.EmailField()
    subject = models.CharField(max_length=255)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    is_resolved = models.BooleanField(default=False)

    def __str__(self):
        return f"Support: {self.subject} ({self.email})"

    class Meta:
        ordering = ['-created_at']
