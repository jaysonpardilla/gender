from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile, Document, BiasedWordMapping, SupportMessage
import json
import re

class UserProfileSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_first_name = serializers.CharField(source='user.first_name', read_only=True)
    user_last_name = serializers.CharField(source='user.last_name', read_only=True)
    avatar = serializers.CharField(read_only=False)
    bio = serializers.CharField(read_only=False)
    
    class Meta:
        model = UserProfile
        fields = [
            'user_email', 'user_first_name', 'user_last_name', 'role', 'avatar', 'bio', 
            'analyses_count', 'biased_words_detected', 'average_score',
            'created_at', 'updated_at'
        ]


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)
    last_login = serializers.DateTimeField(read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'date_joined', 'last_login', 'profile']


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES)
    
    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'password', 'password_confirm', 'role']
    
    def validate(self, data):
        if data['password'] != data.pop('password_confirm'):
            raise serializers.ValidationError({"password": "Passwords do not match."})
        return data
    
    def create(self, validated_data):
        role = validated_data.pop('role')
        if User.objects.filter(username=validated_data['email']).exists():
            raise serializers.ValidationError({'email': 'A user with this email already exists.'})

        user = User.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            password=validated_data['password']
        )

        profile, created = UserProfile.objects.get_or_create(
            user=user,
            defaults={'role': role}
        )
        if not created:
            profile.role = role
            profile.save()

        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class DocumentSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_name = serializers.SerializerMethodField()
    detected_term_categories = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = ['id', 'user_email', 'user_name', 'original_text', 'processed_text', 
                  'detected_words', 'detected_term_categories', 'approved_replacements_count', 'file_name', 'file_type', 'created_at']
        read_only_fields = ['processed_text', 'detected_words', 'approved_replacements_count', 'created_at']
    
    def get_user_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip()

    def get_detected_term_categories(self, obj):
        stored = obj.detected_term_categories if isinstance(obj.detected_term_categories, dict) else {}
        categories = {str(word).lower(): category for word, category in stored.items()}
        detected_words = obj.detected_words
        if isinstance(detected_words, str):
            try:
                detected_words = json.loads(detected_words)
            except json.JSONDecodeError:
                detected_words = [detected_words]
        if not isinstance(detected_words, list):
            detected_words = [detected_words] if detected_words else []

        from .utils import get_dataset_categories
        current_categories = get_dataset_categories()
        for item in detected_words:
            if isinstance(item, dict):
                word = item.get('word') or item.get('biased_word') or item.get('original')
            else:
                word = item
            if word:
                key = str(word).lower()
                categories.setdefault(key, current_categories.get(key, 'other'))
        return categories


class TextAnalysisSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True)
    file = serializers.FileField(required=False)
    
    def validate(self, data):
        if not data.get('text') and not data.get('file'):
            raise serializers.ValidationError("Either text or file must be provided.")
        return data


class SupportMessageSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SupportMessage
        fields = ['id', 'user_email', 'user_name', 'name', 'email', 'subject', 'message', 'created_at', 'is_resolved']
        read_only_fields = ['id', 'user_email', 'user_name', 'created_at']

    def get_user_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip()


class BiasedWordMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = BiasedWordMapping
        fields = ['id', 'biased_word', 'fair_word', 'category']
