from pathlib import Path
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action, api_view, permission_classes, parser_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.db.models import Q, Count, Max
from django.http import HttpResponse, Http404
from django.utils import timezone
from datetime import timedelta
from collections import Counter
import os
from .models import UserProfile, Document, BiasedWordMapping, SupportMessage
from .serializers import (
    UserSerializer, SignupSerializer, LoginSerializer, 
    DocumentSerializer, TextAnalysisSerializer, BiasedWordMappingSerializer,
    UserProfileSerializer, SupportMessageSerializer
)
from .utils import analyze_text, extract_text_from_file, load_dataset_to_db, create_document_file, modify_pdf_with_replacements, modify_pdf_with_text_reflow, append_mappings_to_excel_file, resolve_dataset_path
from .docx_handler import modify_docx_with_replacements
from django.views.decorators.http import require_http_methods
import json
import logging
import traceback

# Setup logging
logger = logging.getLogger('gender_fair_app.views')
api_logger = logging.getLogger('api_requests')


def normalize_detected_words(detected_words):
    """
    Normalize stored detected_words values to a flat list of bias terms.
    Supports legacy string/json values, lists of strings, and lists of dictionaries.
    """
    if detected_words is None:
        return []
    if isinstance(detected_words, str):
        try:
            parsed = json.loads(detected_words)
            return normalize_detected_words(parsed)
        except (json.JSONDecodeError, TypeError):
            return [detected_words]
    if isinstance(detected_words, dict):
        return [
            detected_words.get('word')
            or detected_words.get('biased_word')
            or detected_words.get('original')
            or str(detected_words)
        ]
    if isinstance(detected_words, list):
        normalized = []
        for item in detected_words:
            if isinstance(item, str):
                normalized.append(item)
            elif isinstance(item, dict):
                normalized.append(
                    item.get('word')
                    or item.get('biased_word')
                    or item.get('original')
                    or str(item)
                )
            else:
                normalized.append(str(item))
        return [value for value in normalized if value]
    return [str(detected_words)]


# Auth Views
class SignupView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = SignupSerializer
    permission_classes = [AllowAny]
    
    def create(self, request, *args, **kwargs):
        logger.info(f"📝 SIGNUP REQUEST | Email: {request.data.get('email')}")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        
        logger.info(f"✅ SIGNUP SUCCESS | User: {user.username} ({user.email})")
        return Response({
            'user': UserSerializer(user).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def current_user_view(request):
    """Get or update the authenticated user and their profile."""
    user = request.user
    if request.method == 'GET':
        return Response(UserSerializer(user).data)

    # PATCH: update user/profile
    data = request.data
    try:
        # update basic user fields
        user.first_name = data.get('first_name', user.first_name)
        user.last_name = data.get('last_name', user.last_name)
        # Do not allow email change here for safety unless explicitly supported
        user.save()

        profile_data = data.get('profile', {}) if isinstance(data.get('profile', {}), dict) else {}
        profile = getattr(user, 'profile', None)
        if profile:
            avatar = profile_data.get('avatar') or data.get('avatar')
            bio = profile_data.get('bio') or data.get('bio')
            if avatar is not None:
                profile.avatar = avatar
            if bio is not None:
                profile.bio = bio
            profile.save()

        return Response(UserSerializer(user).data)
    except Exception as e:
        logger.error(f"❌ UPDATE USER PROFILE ERROR | User: {user.username} | Error: {str(e)}")
        return Response({'error': 'Unable to update profile.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    """
    Login endpoint
    Body: {
        "email": "user@example.com",
        "password": "password"
    }
    """
    email = request.data.get('email', 'unknown')
    logger.info(f"🔐 LOGIN REQUEST | Email: {email}")
    
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    email = serializer.validated_data['email']
    password = serializer.validated_data['password']
    
    try:
        user = User.objects.get(email=email)
        user_obj = authenticate(username=user.username, password=password)
        
        if user_obj is None:
            logger.warning(f"❌ LOGIN FAILED | Email: {email} | Reason: Invalid credentials")
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        refresh = RefreshToken.for_user(user_obj)
        
        logger.info(f"✅ LOGIN SUCCESS | User: {user_obj.username} ({email})")
        return Response({
            'user': UserSerializer(user_obj).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }, status=status.HTTP_200_OK)
    
    except User.DoesNotExist:
        logger.warning(f"❌ LOGIN FAILED | Email: {email} | Reason: User not found")
        return Response(
            {'error': 'User not found'},
            status=status.HTTP_401_UNAUTHORIZED
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """
    Change password for authenticated user
    Body: {
        "current_password": "old_password",
        "new_password": "new_password",
        "password_confirm": "new_password"
    }
    """
    user = request.user
    logger.info(f"🔑 CHANGE PASSWORD REQUEST | User: {user.username}")
    
    current_password = request.data.get('current_password', '')
    new_password = request.data.get('new_password', '')
    password_confirm = request.data.get('password_confirm', '')
    
    # Validate current password
    if not user.check_password(current_password):
        logger.warning(f"❌ CHANGE PASSWORD FAILED | User: {user.username} | Reason: Invalid current password")
        return Response(
            {'error': 'Current password is incorrect'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Validate new passwords match
    if new_password != password_confirm:
        logger.warning(f"❌ CHANGE PASSWORD FAILED | User: {user.username} | Reason: Passwords do not match")
        return Response(
            {'error': 'New passwords do not match'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Validate password not empty
    if not new_password:
        logger.warning(f"❌ CHANGE PASSWORD FAILED | User: {user.username} | Reason: New password is required")
        return Response(
            {'error': 'New password is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Validate password length
    if len(new_password) < 8:
        logger.warning(f"❌ CHANGE PASSWORD FAILED | User: {user.username} | Reason: Password too short")
        return Response(
            {'error': 'Password must be at least 8 characters'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Update password
        user.set_password(new_password)
        user.save()
        logger.info(f"✅ CHANGE PASSWORD SUCCESS | User: {user.username}")
        return Response(
            {'message': 'Password changed successfully'},
            status=status.HTTP_200_OK
        )
    except Exception as e:
        logger.error(f"❌ CHANGE PASSWORD ERROR | User: {user.username} | Error: {str(e)}")
        return Response(
            {'error': 'Unable to change password'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([AllowAny])
def admin_exists_view(request):
    """
    Check if an admin user already exists
    Returns: { "exists": true/false }
    """
    try:
        admin_count = User.objects.filter(is_staff=True).count()
        exists = admin_count > 0
        logger.info(f"🔍 ADMIN EXISTS CHECK | Result: {exists}")
        return Response(
            {'exists': exists},
            status=status.HTTP_200_OK
        )
    except Exception as e:
        logger.error(f"❌ ADMIN EXISTS CHECK ERROR | Error: {str(e)}")
        return Response(
            {'error': 'Unable to check admin status'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Analysis Views
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analyze_text_view(request):
    """
    Analyze text for biased language
    Body: {
        "text": "The chairman spoke to his employees..."
    }
    """
    user = request.user.username
    text_preview = request.data.get('text', '')[:50] + '...' if len(request.data.get('text', '')) > 50 else request.data.get('text', '')
    logger.info(f"📝 ANALYZE TEXT REQUEST | User: {user} | Text: '{text_preview}'")
    
    serializer = TextAnalysisSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    text = serializer.validated_data.get('text', '')
    
    if not text:
        logger.warning(f"❌ ANALYZE TEXT FAILED | User: {user} | Reason: Text is required")
        return Response(
            {'error': 'Text is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Analyze text
    result = analyze_text(text)
    
    # Save to database
    document = Document.objects.create(
        user=request.user,
        original_text=result['original_text'],
        processed_text=result['processed_text'],
        detected_words=result['detected_words'],
        approved_replacements_count=0,
        file_type='text'
    )
    
    detected_count = len(result['detected_words'])
    logger.info(f"✅ ANALYZE TEXT SUCCESS | User: {user} | Detected: {detected_count} words | Doc ID: {document.id}")
    
    return Response({
        'document_id': document.id,
        'original_text': result['original_text'],
        'processed_text': result['processed_text'],
        'detected_words': result['detected_words'],
        'replacements': result['replacements'],
        'created_at': document.created_at
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_document_view(request):
    """
    Upload and analyze a document
    Body: FormData with 'file' field
    """
    user = request.user.username
    file_name = request.FILES.get('file').name if 'file' in request.FILES else 'unknown'
    logger.info(f"📤 UPLOAD DOCUMENT REQUEST | User: {user} | File: {file_name}")
    logger.debug(
        f"UPLOAD DOCUMENT REQUEST META | content_type={request.content_type} | META_CONTENT_TYPE={request.META.get('CONTENT_TYPE')} | FILES={list(request.FILES.keys())} | DATA={list(request.data.keys())}"
    )
    
    serializer = TextAnalysisSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    file = serializer.validated_data.get('file') or request.FILES.get('file')
    
    if not file:
        logger.warning(f"❌ UPLOAD DOCUMENT FAILED | User: {user} | Reason: File is required")
        return Response(
            {'error': 'File is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Extract text from file
        text, file_type = extract_text_from_file(file)
        
        if not text.strip():
            logger.warning(f"❌ UPLOAD DOCUMENT FAILED | User: {user} | File: {file_name} | Reason: No text found")
            return Response(
                {'error': 'No text found in file'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get original file bytes for preview rendering
        file.seek(0)  # Reset file pointer to beginning
        file_bytes = file.read()
        import base64
        file_data_base64 = base64.b64encode(file_bytes).decode('utf-8')
        
        # Analyze text
        result = analyze_text(text)
        
        # Allow an optional approved replacement count to be persisted when saving a corrected document
        approved_replacements_count = request.data.get('approved_replacements_count', 0)
        try:
            approved_replacements_count = int(approved_replacements_count)
        except (TypeError, ValueError):
            approved_replacements_count = 0
        
        # Save to database
        document = Document.objects.create(
            user=request.user,
            original_text=result['original_text'],
            processed_text=result['processed_text'],
            detected_words=result['detected_words'],
            approved_replacements_count=approved_replacements_count,
            file_name=file.name,
            file_type=file_type
        )
        
        detected_count = len(result['detected_words'])
        logger.info(f"✅ UPLOAD DOCUMENT SUCCESS | User: {user} | File: {file_name} | Type: {file_type} | Detected: {detected_count} words | Doc ID: {document.id}")
        
        return Response({
            'document_id': document.id,
            'file_name': file.name,
            'file_type': file_type,
            'original_text': result['original_text'],
            'processed_text': result['processed_text'],
            'detected_words': result['detected_words'],
            'replacements': result['replacements'],
            'file_data': file_data_base64,
            'created_at': document.created_at
        }, status=status.HTTP_200_OK)
    
    except ValueError as e:
        logger.error(f"❌ UPLOAD DOCUMENT ERROR | User: {user} | File: {file_name} | Error: {str(e)}")
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )


# Document Views
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_history_view(request):
    """Get user's analysis history"""
    user = request.user.username
    logger.info(f"📋 GET HISTORY REQUEST | User: {user}")
    
    documents = Document.objects.filter(user=request.user).order_by('-created_at')
    count = documents.count()
    
    logger.info(f"✅ GET HISTORY SUCCESS | User: {user} | Found: {count} documents")
    serializer = DocumentSerializer(documents, many=True)
    return Response(serializer.data)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def document_detail_view(request, doc_id):
    """Get, update, or delete specific document details"""
    user = request.user.username
    logger.info(f"📄 DOCUMENT REQUEST | User: {user} | Doc ID: {doc_id} | Method: {request.method}")

    try:
        document = Document.objects.get(id=doc_id, user=request.user)
    except Document.DoesNotExist:
        logger.warning(f"❌ DOCUMENT NOT FOUND | User: {user} | Doc ID: {doc_id}")
        return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        logger.info(f"✅ GET DOCUMENT SUCCESS | User: {user} | Doc ID: {doc_id}")
        serializer = DocumentSerializer(document)
        return Response(serializer.data)

    if request.method == 'DELETE':
        try:
            document.delete()
            logger.info(f"✅ DOCUMENT DELETED | User: {user} | Doc ID: {doc_id}")
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            logger.error(f"❌ DELETE DOCUMENT ERROR | User: {user} | Doc ID: {doc_id} | Error: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # PATCH: update approved_replacements_count or processed_text
    if request.method == 'PATCH':
        try:
            approved_count = request.data.get('approved_replacements_count')
            processed_text = request.data.get('processed_text')
            updated = False
            if approved_count is not None:
                try:
                    approved_count = int(approved_count)
                    document.approved_replacements_count = approved_count
                    updated = True
                except (TypeError, ValueError):
                    logger.warning(f"❌ INVALID approved_replacements_count provided for Doc {doc_id}")

            if processed_text is not None:
                document.processed_text = processed_text
                updated = True

            if updated:
                document.save()
                logger.info(f"✅ DOCUMENT UPDATED | User: {user} | Doc ID: {doc_id} | approved_replacements_count={document.approved_replacements_count}")
            serializer = DocumentSerializer(document)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"❌ UPDATE DOCUMENT ERROR | User: {user} | Doc ID: {doc_id} | Error: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def download_document_view(request, doc_id):
    """Download the corrected version of a document in its original file format."""
    user = request.user.username
    logger.info(f"⬇️ DOWNLOAD DOCUMENT REQUEST | User: {user} | Doc ID: {doc_id}")

    try:
        document_instance = Document.objects.get(id=doc_id, user=request.user)
    except Document.DoesNotExist:
        logger.warning(f"❌ DOWNLOAD DOCUMENT FAILED | User: {user} | Doc ID: {doc_id} | Reason: Document not found")
        return Response(
            {'error': 'Document not found'},
            status=status.HTTP_404_NOT_FOUND
        )

    file_type = (document_instance.file_type or 'text').lower()
    try:
        file_buffer = create_document_file(document_instance.processed_text, file_type)
    except ImportError as e:
        logger.error(f"❌ DOWNLOAD DOCUMENT ERROR | User: {user} | Doc ID: {doc_id} | Error: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        logger.error(f"❌ DOWNLOAD DOCUMENT ERROR | User: {user} | Doc ID: {doc_id} | Error: {str(e)}")
        return Response(
            {'error': 'Failed to generate corrected file'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    if file_type == 'docx':
        content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        extension = 'docx'
    elif file_type == 'pdf':
        content_type = 'application/pdf'
        extension = 'pdf'
    else:
        content_type = 'text/plain'
        extension = 'txt'

    file_name = document_instance.file_name or f'document.{extension}'
    base_name = os.path.splitext(file_name)[0]
    download_name = f'corrected-{base_name}.{extension}'

    response = HttpResponse(file_buffer.getvalue(), content_type=content_type)
    response['Content-Disposition'] = f'attachment; filename="{download_name}"'
    # Allow browser JS to read these headers (CORS) so the frontend can determine filename and type
    response['Access-Control-Expose-Headers'] = 'Content-Disposition, Content-Type'

    logger.info(f"✅ DOWNLOAD DOCUMENT SUCCESS | User: {user} | Doc ID: {doc_id} | Download: {download_name}")
    return response


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_corrected_file_view(request):
    """Generate a corrected file with only approved replacements applied.
    
    Body: {
        "original_text": "The chairman spoke...",
        "replacements": [
            {"original": "chairman", "replacement": "chair"},
            ...
        ],
        "file_type": "docx|pdf|txt",
        "file_name": "document.docx"
    }
    """
    user = request.user.username
    logger.info(f"📄 GENERATE CORRECTED FILE REQUEST | User: {user}")
    
    try:
        original_text = request.data.get('original_text', '')
        replacements = request.data.get('replacements', [])
        file_type = (request.data.get('file_type', 'txt') or 'txt').lower()
        file_name = request.data.get('file_name', f'document.{file_type}')
        
        if not original_text:
            logger.warning(f"❌ GENERATE FILE FAILED | User: {user} | Reason: No text provided")
            return Response(
                {'error': 'No text provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Apply only approved replacements to the original text
        processed_text = original_text
        for item in replacements:
            if item.get('approved', False):
                original_word = item.get('original', '')
                replacement_word = item.get('replacement', '')
                if original_word and replacement_word:
                    # Case-insensitive replacement with word boundaries
                    import re
                    # Preserve capitalization (same logic as analyze_text)
                    pattern = r'\b' + re.escape(original_word) + r'\b'
                    
                    def replace_with_case(match):
                        matched_text = match.group(0)
                        if matched_text[0].isupper():
                            return replacement_word[0].upper() + replacement_word[1:] if len(replacement_word) > 1 else replacement_word.upper()
                        return replacement_word
                    
                    processed_text = re.sub(pattern, replace_with_case, processed_text, flags=re.IGNORECASE)
        
        # Create the file in the correct format
        file_buffer = create_document_file(processed_text, file_type)
        
        # Determine content type and extension
        if file_type == 'docx':
            content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            extension = 'docx'
        elif file_type == 'pdf':
            content_type = 'application/pdf'
            extension = 'pdf'
        else:
            content_type = 'text/plain'
            extension = 'txt'
        
        # Generate download filename
        base_name = os.path.splitext(file_name)[0]
        download_name = f'corrected-{base_name}.{extension}'
        
        response = HttpResponse(file_buffer.getvalue(), content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{download_name}"'
        response['Access-Control-Expose-Headers'] = 'Content-Disposition, Content-Type'
        
        logger.info(f"✅ GENERATE CORRECTED FILE SUCCESS | User: {user} | File Type: {file_type} | Replacements: {len([r for r in replacements if r.get('approved')])}")
        return response
        
    except Exception as e:
        logger.error(f"❌ GENERATE CORRECTED FILE ERROR | User: {user} | Error: {str(e)}")
        return Response(
            {'error': 'Failed to generate file'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def support_message_view(request):
    """Save a support/contact message to the database."""
    user = request.user.username
    logger.info(f"📬 SUPPORT MESSAGE REQUEST | User: {user}")

    data = {
        'name': request.data.get('name', '').strip(),
        'email': request.data.get('email', '').strip(),
        'subject': request.data.get('subject', '').strip(),
        'message': request.data.get('message', '').strip(),
    }

    serializer = SupportMessageSerializer(data=data)
    if not serializer.is_valid():
        logger.warning(f"❌ SUPPORT MESSAGE VALIDATION FAILED | User: {user} | Errors: {serializer.errors}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    try:
        support_message = serializer.save(user=request.user)
        logger.info(f"✅ SUPPORT MESSAGE SAVED | User: {user} | Message ID: {support_message.id}")
        return Response({'message': 'Support request saved successfully.'}, status=status.HTTP_201_CREATED)
    except Exception as e:
        logger.error(f"❌ SUPPORT MESSAGE SAVE ERROR | User: {user} | Error: {str(e)}")
        return Response({'error': 'Unable to save support message.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def modify_pdf_view(request):
    """
    Modify a PDF by applying approved text replacements using PyMuPDF.
    This is for live preview generation on the frontend.
    
    Body: FormData with:
        - 'pdf_file': The original PDF file
        - 'replacements': JSON string with list of {"original": str, "replacement": str, "approved": bool}
    
    Response: The modified PDF as binary
    """
    logger.info("📄 MODIFY PDF REQUEST received")
    logger.info(f"📋 Request files: {list(request.FILES.keys())}")
    logger.info(f"📋 Request data: {list(request.data.keys())}")
    
    try:
        # Get the PDF file from request
        pdf_file = request.FILES.get('pdf_file')
        if not pdf_file:
            logger.warning("❌ MODIFY PDF FAILED: No PDF file provided")
            logger.warning(f"📋 Available files: {list(request.FILES.keys())}")
            return Response(
                {'error': 'No PDF file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get replacements from request
        replacements_json = request.data.get('replacements', '[]')
        logger.info(f"📋 Raw replacements JSON received: {replacements_json[:200] if replacements_json else 'EMPTY'}")
        
        try:
            if isinstance(replacements_json, str):
                replacements = json.loads(replacements_json)
            else:
                replacements = list(replacements_json) if hasattr(replacements_json, '__iter__') else []
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"❌ MODIFY PDF FAILED: Invalid replacements JSON - {e}")
            logger.warning(f"📋 Attempted to parse: {replacements_json}")
            return Response(
                {'error': 'Invalid replacements format'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Read PDF bytes
        pdf_bytes = pdf_file.read()
        if not pdf_bytes:
            logger.warning("❌ MODIFY PDF FAILED: PDF file is empty")
            return Response(
                {'error': 'PDF file is empty'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        logger.info(f"📦 Received PDF file: {pdf_file.name} ({len(pdf_bytes)} bytes)")
        logger.info(f"📋 Parsed replacements: {json.dumps(replacements, indent=2)}")
        
        # Count approved replacements
        approved = [r for r in replacements if r.get('approved')]
        logger.info(f"🔍 Replacement details:")
        logger.info(f"   Total replacements: {len(replacements)}")
        logger.info(f"   Approved replacements: {len(approved)}")
        for i, r in enumerate(approved):
            logger.info(f"   [{i}] '{r.get('original')}' → '{r.get('replacement')}'")
        
        # Modify the PDF with replacements
        logger.info(f"🔧 Starting PDF modification with {len(approved)} approved replacements")
        try:
            # Use text reflow system for proper text replacement
            # This extracts words, replaces biased terms, and rebuilds the PDF with proper layout
            # Falls back to coordinate-based approach if text reflow fails
            logger.info("   🔄 Using text reflow system for proper word replacement...")
            modified_pdf = modify_pdf_with_text_reflow(pdf_bytes, replacements)
            logger.info("✅ PDF MODIFICATION SUCCESS - Text properly replaced with layout reflow")
            
            modified_bytes = modified_pdf.getvalue()
            logger.info(f"✅ PDF modification completed | Output size: {len(modified_bytes)} bytes")
        except Exception as e:
            # Log full traceback for debugging
            logger.exception("❌ MODIFY PDF FAILED during modification")
            tb = traceback.format_exc()
            logger.error(f"Full traceback:\n{tb}")
            return Response(
                {'error': f'Failed to modify PDF: {str(e)}', 'traceback': tb},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Return the modified PDF as response
        response = HttpResponse(modified_pdf.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="modified.pdf"'
        response['Access-Control-Expose-Headers'] = 'Content-Type'
        
        logger.info(f"✅ MODIFY PDF SUCCESS | Approved replacements: {len(approved)} | Output: {len(modified_pdf.getvalue())} bytes")
        return response
        
    except Exception as e:
        logger.error(f"❌ MODIFY PDF ERROR: {str(e)}")
        logger.exception("Full exception:")
        return Response(
            {'error': f'Failed to modify PDF: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes((MultiPartParser, FormParser))
def modify_docx_view(request):
    """
    Modify a DOCX document by applying approved gender-fair text replacements.
    This endpoint modifies the actual document structure, preserving formatting.
    
    Body: FormData with:
        - 'docx_file': The original DOCX file
        - 'replacements': JSON string with list of {"original": str, "replacement": str, "approved": bool}
    
    Response: The modified DOCX as binary
    """
    logger.info("📄 MODIFY DOCX REQUEST received")
    logger.info(f"📋 Request files: {list(request.FILES.keys())}")
    logger.info(f"📋 Request data: {list(request.data.keys())}")
    
    try:
        # Get the DOCX file from request
        docx_file = request.FILES.get('docx_file')
        if not docx_file:
            logger.warning("❌ MODIFY DOCX FAILED: No DOCX file provided")
            logger.warning(f"📋 Available files: {list(request.FILES.keys())}")
            return Response(
                {'error': 'No DOCX file provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get replacements from request
        replacements_json = request.data.get('replacements', '[]')
        logger.info(f"📋 Raw replacements JSON received: {replacements_json[:200] if replacements_json else 'EMPTY'}")
        
        try:
            if isinstance(replacements_json, str):
                replacements = json.loads(replacements_json)
            else:
                replacements = list(replacements_json) if hasattr(replacements_json, '__iter__') else []
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"❌ MODIFY DOCX FAILED: Invalid replacements JSON - {e}")
            logger.warning(f"📋 Attempted to parse: {replacements_json}")
            return Response(
                {'error': 'Invalid replacements format'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Read DOCX bytes
        docx_bytes = docx_file.read()
        if not docx_bytes:
            logger.warning("❌ MODIFY DOCX FAILED: DOCX file is empty")
            return Response(
                {'error': 'DOCX file is empty'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        logger.info(f"📦 Received DOCX file: {docx_file.name} ({len(docx_bytes)} bytes)")
        logger.info(f"📋 Parsed replacements: {json.dumps(replacements, indent=2)}")
        
        # Count approved replacements
        approved = [r for r in replacements if r.get('approved')]
        logger.info(f"🔍 Replacement details:")
        logger.info(f"   Total replacements: {len(replacements)}")
        logger.info(f"   Approved replacements: {len(approved)}")
        for i, r in enumerate(approved):
            logger.info(f"   [{i}] '{r.get('original')}' → '{r.get('replacement')}'")
        
        # Modify the DOCX with replacements
        logger.info(f"🔧 Starting DOCX modification with {len(approved)} approved replacements")
        
        try:
            modified_docx, report = modify_docx_with_replacements(docx_bytes, replacements)
            modified_bytes = modified_docx.getvalue()
            
            logger.info(f"✅ DOCX modification completed | Output size: {len(modified_bytes)} bytes")
            logger.info(f"📊 Replacement report: {json.dumps(report, indent=2)}")
            
        except Exception as e:
            logger.exception("❌ MODIFY DOCX FAILED during modification")
            tb = traceback.format_exc()
            logger.error(f"Full traceback:\n{tb}")
            return Response(
                {'error': f'Failed to modify DOCX: {str(e)}', 'traceback': tb},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Return the modified DOCX as response
        response = HttpResponse(modified_bytes, content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        response['Content-Disposition'] = f'inline; filename="modified.docx"'
        response['Access-Control-Expose-Headers'] = 'Content-Type'
        
        logger.info(f"✅ MODIFY DOCX SUCCESS | Approved replacements: {len(approved)} | Output: {len(modified_bytes)} bytes")
        return response
        
    except Exception as e:
        logger.error(f"❌ MODIFY DOCX ERROR: {str(e)}")
        logger.exception("Full exception:")
        return Response(
            {'error': f'Failed to modify DOCX: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Dashboard Views
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats_view(request):
    """Get dashboard statistics for current user"""
    user = request.user
    logger.info(f"📊 DASHBOARD STATS REQUEST | User: {user.email}")
    
    try:
        user_docs = Document.objects.filter(user=user)
        total_documents = user_docs.count()
        all_detected = []
        total_replacements = 0
        for doc in user_docs:
            all_detected.extend(doc.detected_words)
            total_replacements += getattr(doc, 'approved_replacements_count', 0) or 0
        total_biased_words = len(all_detected)
        last_analysis = user_docs.order_by('-created_at').first()
        last_analysis_date = last_analysis.created_at if last_analysis else None

        if total_documents > 0:
            total_score = 0
            for doc in user_docs:
                detected = doc.detected_words or []
                total_score += int((100 - len(detected) * 5) if detected else 100)
            fairness_score = int(total_score / total_documents)
        else:
            fairness_score = 0

        logger.info(f"✅ DASHBOARD STATS SUCCESS | User: {user.email} | Docs: {total_documents} | Words: {total_biased_words} | Score: {fairness_score}%")
        return Response({
            'total_documents': total_documents,
            'total_biased_words': total_biased_words,
            'total_replacements': total_replacements,
            'last_analysis_date': last_analysis_date,
            'fairness_score': fairness_score,
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"❌ DASHBOARD STATS ERROR | User: {user.email} | Error: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_recent_analyses_view(request):
    """Get recent analyses for dashboard"""
    user = request.user
    limit = int(request.query_params.get('limit', 5))
    logger.info(f"📋 DASHBOARD RECENT ANALYSES REQUEST | User: {user.email} | Limit: {limit}")
    
    try:
        documents = Document.objects.filter(user=user).order_by('-created_at')[:limit]
        data = []
        for doc in documents:
            data.append({
                'id': doc.id,
                'file_name': doc.file_name or 'Text Input',
                'file_type': doc.file_type or 'text',
                'biased_words_found': len(doc.detected_words),
                'fairness_score': int((100 - len(doc.detected_words) * 5) if doc.detected_words else 100),
                'created_at': doc.created_at,
            })
        logger.info(f"✅ DASHBOARD RECENT ANALYSES SUCCESS | User: {user.email} | Count: {len(data)}")
        return Response(data, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"❌ DASHBOARD RECENT ANALYSES ERROR | User: {user.email} | Error: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_top_bias_words_view(request):
    """Get top detected bias words for dashboard"""
    user = request.user
    limit = int(request.query_params.get('limit', 10))
    logger.info(f"🔤 DASHBOARD TOP BIAS WORDS REQUEST | User: {user.email} | Limit: {limit}")
    
    try:
        user_docs = Document.objects.filter(user=user)
        all_detected = []
        for doc in user_docs:
            all_detected.extend(normalize_detected_words(doc.detected_words))

        word_counts = Counter(all_detected)
        top_words = dict(word_counts.most_common(limit))
        data = [{'word': word, 'count': count} for word, count in top_words.items()]
        logger.info(f"✅ DASHBOARD TOP BIAS WORDS SUCCESS | User: {user.email} | Words: {len(data)}")
        return Response(data, status=status.HTTP_200_OK)
        return Response(data, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"❌ DASHBOARD TOP BIAS WORDS ERROR | User: {user.email} | Error: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_documents_over_time_view(request):
    """Get document count over time for dashboard chart"""
    user = request.user
    days = int(request.query_params.get('days', 42))
    logger.info(f"📈 DASHBOARD DOCUMENTS OVER TIME REQUEST | User: {user.email} | Days: {days}")
    
    try:
        start_date = timezone.now() - timedelta(days=days)
        user_docs = Document.objects.filter(user=user, created_at__gte=start_date).order_by('created_at')
        data_by_date = {}
        for doc in user_docs:
            date_key = doc.created_at.date().isoformat()
            data_by_date[date_key] = data_by_date.get(date_key, 0) + 1

        result = []
        cumulative = 0
        start_date_only = start_date.date()
        for offset in range(days + 1):
            current_date = start_date_only + timedelta(days=offset)
            date_key = current_date.isoformat()
            cumulative += data_by_date.get(date_key, 0)
            result.append({'date': date_key, 'count': cumulative})

        logger.info(f"✅ DASHBOARD DOCUMENTS OVER TIME SUCCESS | User: {user.email} | Data points: {len(result)}")
        return Response(result, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"❌ DASHBOARD DOCUMENTS OVER TIME ERROR | User: {user.email} | Error: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Admin Views
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_all_users_view(request):
    """Admin: Get all users with document stats"""
    user = request.user.username
    logger.info(f"👥 GET ALL USERS REQUEST | User: {user}")

    if not hasattr(request.user, 'profile') or request.user.profile.role != 'admin':
        logger.warning(f"❌ GET ALL USERS FAILED | User: {user} | Reason: Admin access required")
        return Response(
            {'error': 'Admin access required'},
            status=status.HTTP_403_FORBIDDEN
        )

    users = User.objects.annotate(
        documents_count=Count('documents', distinct=True),
        last_processed_at=Max('documents__created_at')
    ).order_by('-documents_count', '-last_processed_at', 'email')

    data = []
    for usr in users:
        last_doc = Document.objects.filter(user=usr).order_by('-created_at').first()
        data.append({
            'id': usr.id,
            'email': usr.email,
            'first_name': usr.first_name,
            'last_name': usr.last_name,
            'role': getattr(getattr(usr, 'profile', None), 'role', 'user'),
            'documents_count': usr.documents_count,
            'last_processed_at': usr.last_processed_at,
            'last_document_name': last_doc.file_name if last_doc else None,
            'last_document_type': last_doc.file_type if last_doc else None,
            'last_document_fairness_score': (
                int((100 - len(normalize_detected_words(last_doc.detected_words)) * 5))
                if last_doc and normalize_detected_words(last_doc.detected_words) else 100
            ) if last_doc else None,
        })

    count = len(data)
    logger.info(f"✅ GET ALL USERS SUCCESS | Admin: {user} | Total: {count} users")
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_all_documents_view(request):
    """Admin: Get all documents"""
    user = request.user.username
    logger.info(f"📚 GET ALL DOCUMENTS REQUEST | User: {user}")
    
    if not hasattr(request.user, 'profile') or request.user.profile.role != 'admin':
        logger.warning(f"❌ GET ALL DOCUMENTS FAILED | User: {user} | Reason: Admin access required")
        return Response(
            {'error': 'Admin access required'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    documents = Document.objects.all().order_by('-created_at')
    count = documents.count()
    logger.info(f"✅ GET ALL DOCUMENTS SUCCESS | Admin: {user} | Total: {count} documents")
    serializer = DocumentSerializer(documents, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_support_messages_view(request):
    """Admin: Get all customer support messages"""
    user = request.user.username
    logger.info(f"📨 GET SUPPORT MESSAGES REQUEST | User: {user}")

    if not hasattr(request.user, 'profile') or request.user.profile.role != 'admin':
        logger.warning(f"❌ GET SUPPORT MESSAGES FAILED | User: {user} | Reason: Admin access required")
        return Response(
            {'error': 'Admin access required'},
            status=status.HTTP_403_FORBIDDEN
        )

    support_messages = SupportMessage.objects.select_related('user').order_by('-created_at')
    serializer = SupportMessageSerializer(support_messages, many=True)
    logger.info(f"✅ GET SUPPORT MESSAGES SUCCESS | Admin: {user} | Total: {support_messages.count()}")
    return Response(serializer.data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def admin_support_message_view(request, message_id: int):
    """Admin: Update a support message state."""
    user = request.user.username
    logger.info(f"📨 PATCH SUPPORT MESSAGE REQUEST | User: {user} | Message ID: {message_id}")

    if not hasattr(request.user, 'profile') or request.user.profile.role != 'admin':
        logger.warning(f"❌ PATCH SUPPORT MESSAGE FAILED | User: {user} | Reason: Admin access required")
        return Response(
            {'error': 'Admin access required'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        support_message = SupportMessage.objects.get(id=message_id)
    except SupportMessage.DoesNotExist:
        logger.warning(f"❌ PATCH SUPPORT MESSAGE FAILED | User: {user} | Reason: Message {message_id} not found")
        return Response({'error': 'Support message not found.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = SupportMessageSerializer(support_message, data=request.data, partial=True)
    if not serializer.is_valid():
        logger.warning(f"❌ PATCH SUPPORT MESSAGE VALIDATION FAILED | User: {user} | Message ID: {message_id} | Errors: {serializer.errors}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    support_message = serializer.save()
    logger.info(f"✅ PATCH SUPPORT MESSAGE SUCCESS | User: {user} | Message ID: {message_id} | Resolved: {support_message.is_resolved}")
    return Response(SupportMessageSerializer(support_message).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_analytics_view(request):
    """Admin: Get analytics and statistics"""
    user = request.user.username
    logger.info(f"📊 GET ANALYTICS REQUEST | User: {user}")
    
    if not hasattr(request.user, 'profile') or request.user.profile.role != 'admin':
        logger.warning(f"❌ GET ANALYTICS FAILED | User: {user} | Reason: Admin access required")
        return Response(
            {'error': 'Admin access required'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Total statistics
    total_documents = Document.objects.count()
    total_users = User.objects.count()
    
    # Most common biased words
    from collections import Counter
    all_detected = []
    documents = Document.objects.all()
    for doc in documents:
        all_detected.extend(normalize_detected_words(doc.detected_words))
    
    word_counts = Counter(all_detected)
    most_common = dict(word_counts.most_common(10))
    
    # Active users in the last 30 days
    date_30_days_ago = timezone.now() - timedelta(days=30)
    active_users_last_30_days = User.objects.filter(documents__created_at__gte=date_30_days_ago).distinct().count()

    # Fairness score trend and documents over time for the last 30 days
    last_30_days = timezone.now() - timedelta(days=30)
    docs_last_30_days = Document.objects.filter(created_at__gte=last_30_days).order_by('created_at')
    documents_over_time = {}
    fairness_score_by_date = {}
    for doc in docs_last_30_days:
        normalized_detected = normalize_detected_words(doc.detected_words)
        date_key = doc.created_at.date().isoformat()
        documents_over_time[date_key] = documents_over_time.get(date_key, 0) + 1
        score = int((100 - len(normalized_detected) * 5) if normalized_detected else 100)
        fairness_score_by_date.setdefault(date_key, []).append(score)

    for offset in range(31):
        date_key = (timezone.now().date() - timedelta(days=offset)).isoformat()
        documents_over_time.setdefault(date_key, 0)
        fairness_score_by_date.setdefault(date_key, [])

    documents_over_time_result = []
    fairness_score_trend = []
    cumulative_count = 0
    for date_key in sorted(documents_over_time.keys()):
        cumulative_count += documents_over_time[date_key]
        average_score = int(sum(fairness_score_by_date[date_key]) / len(fairness_score_by_date[date_key])) if fairness_score_by_date[date_key] else 100
        documents_over_time_result.append({'date': date_key, 'count': cumulative_count})
        fairness_score_trend.append({'date': date_key, 'score': average_score})

    # Document type breakdown
    type_counts = {}
    for doc in documents:
        file_type = (doc.file_type or 'text').lower()
        if file_type not in ['pdf', 'docx', 'txt']:
            file_type = 'other'
        type_counts[file_type] = type_counts.get(file_type, 0) + 1
    document_type_breakdown = [{'type': key.upper(), 'count': value} for key, value in type_counts.items()]

    # Basic bias category grouping for visualization
    categories = {
        'Occupational': 0,
        'Pronouns': 0,
        'Titles': 0,
        'Generic Terms': 0,
        'Other': 0,
    }
    pronouns = {'he', 'she', 'him', 'her', 'his', 'hers', 'they', 'them', 'their', 'theirs', 'themself', 'himself'}
    titles = {'mr', 'mrs', 'miss', 'ms', 'mx', 'sir', 'madam', 'lord', 'lady', 'dr', 'professor', 'captain', 'judge'}
    generic = {'man', 'woman', 'people', 'person', 'child', 'children', 'adult', 'guy', 'lady', 'citizen'}
    occupations = {'engineer', 'manager', 'doctor', 'nurse', 'teacher', 'driver', 'waiter', 'waitress', 'police', 'fireman', 'firefighter', 'soldier', 'pilot', 'chef', 'lawyer'}

    for word in word_counts.keys():
        lower_word = word.lower()
        if any(token in lower_word for token in occupations):
            categories['Occupational'] += word_counts[word]
        elif lower_word in pronouns:
            categories['Pronouns'] += word_counts[word]
        elif lower_word in titles:
            categories['Titles'] += word_counts[word]
        elif lower_word in generic:
            categories['Generic Terms'] += word_counts[word]
        else:
            categories['Other'] += word_counts[word]

    bias_categories_distribution = [{'category': key, 'count': value} for key, value in categories.items()]

    # Support summary
    support_messages = SupportMessage.objects.all()
    support_today = support_messages.filter(created_at__date=timezone.now().date()).count()
    unresolved_support = support_messages.filter(is_resolved=False).count()
    total_support = support_messages.count()

    logger.info(f"✅ GET ANALYTICS SUCCESS | Admin: {user} | Docs: {total_documents} | Users: {total_users} | Total Biased Words: {len(all_detected)}")
    return Response({
        'total_documents': total_documents,
        'total_users': total_users,
        'total_biased_words_detected': len(all_detected),
        'total_analyses': total_documents,
        'average_fairness_score': int(
            sum(
                (
                    100 - len(normalize_detected_words(doc.detected_words)) * 5
                ) if normalize_detected_words(doc.detected_words) else 100
                for doc in documents
            ) / total_documents
        ) if total_documents > 0 else 100,
        'active_users_last_30_days': active_users_last_30_days,
        'documents_over_time': documents_over_time_result,
        'fairness_score_trend': fairness_score_trend,
        'document_type_breakdown': document_type_breakdown,
        'bias_categories_distribution': bias_categories_distribution,
        'most_common_biased_words': most_common,
        'support_summary': {
            'total_messages': total_support,
            'today': support_today,
            'unresolved': unresolved_support,
        },
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def admin_dataset_view(request):
    """Admin: Get dataset mappings or add a new mapping."""
    user = request.user.username
    search_query = request.query_params.get('search', '')
    logger.info(f"🔍 DATASET REQUEST | User: {user} | Method: {request.method} | Search: '{search_query}'" if search_query else f"🔍 DATASET REQUEST | User: {user} | Method: {request.method}")
    
    if not hasattr(request.user, 'profile') or request.user.profile.role != 'admin':
        logger.warning(f"❌ DATASET ACCESS FAILED | User: {user} | Reason: Admin access required")
        return Response(
            {'error': 'Admin access required'},
            status=status.HTTP_403_FORBIDDEN
        )

    # POST: add new mapping
    if request.method == 'POST':
        biased_word = (request.data.get('biased_word') or request.data.get('gendered_term') or '').strip().lower()
        fair_word = (request.data.get('fair_word') or request.data.get('gender_fair_term') or '').strip()
        if not biased_word or not fair_word:
            logger.warning(f"❌ ADD MAPPING FAILED | Admin: {user} | Missing fields")
            return Response({'error': 'Both biased_word and fair_word are required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            obj, created = BiasedWordMapping.objects.update_or_create(biased_word=biased_word, defaults={'fair_word': fair_word})
            
            status_msg = "CREATED"
            if not created:
                status_msg = "ALREADY_EXISTS"
                if obj.fair_word != fair_word:
                    obj.fair_word = fair_word
                    obj.save()
                    status_msg = "UPDATED"
            
            try:
                from django.core.cache import cache
                cache.delete('gender_fair_dataset')
            except Exception:
                pass
            from .utils import append_mapping_to_excel
            success = append_mapping_to_excel(biased_word, fair_word)
            
            logger.info(f"✅ MAPPING {status_msg} | Admin: {user} | Biased: '{biased_word}' | Fair: '{fair_word}' | ExcelUpdate: {success}")
            print(f"[ADMIN DATASET] ✅ Mapping {status_msg}: '{biased_word}' → '{fair_word}'")
            
            serializer = BiasedWordMappingSerializer(obj)
            response_data = serializer.data
            response_data['is_duplicate'] = not created
            response_data['status'] = status_msg
            
            return Response(response_data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"❌ ADD MAPPING ERROR | Admin: {user} | Error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # GET: list mappings from the database (Excel is only a legacy import source)
    from .utils import get_dataset_from_excel
    dataset_mappings = get_dataset_from_excel()
    
    # Filter if search query provided
    if search_query:
        filtered = [m for m in dataset_mappings if search_query.lower() in m['biased_word'] or search_query.lower() in m['fair_word']]
    else:
        filtered = dataset_mappings
    
    count = len(filtered)
    logger.info(f"✅ GET DATASET SUCCESS | Admin: {user} | Total: {count} mappings from database")
    
    # Convert to response format that matches BiasedWordMappingSerializer
    result = [
        {
            'id': m['id'] if m.get('id') is not None else idx + 1,
            'biased_word': m['biased_word'],
            'fair_word': m['fair_word']
        }
        for idx, m in enumerate(filtered)
    ]
    return Response(result)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def admin_dataset_mapping_view(request, mapping_id):
    """Admin: delete a dataset mapping row."""
    user = request.user.username
    if not hasattr(request.user, 'profile') or request.user.profile.role != 'admin':
        logger.warning(f"❌ DATASET DELETE ACCESS FAILED | User: {user} | Reason: Admin access required")
        return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)

    try:
        mapping = BiasedWordMapping.objects.get(id=mapping_id)
    except BiasedWordMapping.DoesNotExist:
        return Response({'error': 'Mapping not found.'}, status=status.HTTP_404_NOT_FOUND)

    mapping.delete()
    try:
        from django.core.cache import cache
        cache.delete('gender_fair_dataset')
    except Exception:
        pass

    logger.info(f"✅ DATASET MAPPING DELETED | Admin: {user} | MappingId: {mapping_id}")
    return Response({'message': 'Mapping deleted successfully.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def admin_dataset_import_view(request):
    """Admin: Import dataset rows from uploaded Excel file."""
    user = request.user.username
    uploaded_file = request.FILES.get('file')
    logger.info(
        f"🗃️ DATASET IMPORT REQUEST | User: {user} | File: {uploaded_file.name if uploaded_file is not None else 'none'}"
    )

    if not hasattr(request.user, 'profile') or request.user.profile.role != 'admin':
        logger.warning(f"❌ DATASET IMPORT ACCESS FAILED | User: {user} | Reason: Admin access required")
        return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)

    if not uploaded_file:
        logger.warning(f"❌ DATASET IMPORT FAILED | Admin: {user} | Reason: File is required")
        return Response({'error': 'File upload is required.'}, status=status.HTTP_400_BAD_REQUEST)

    ext = Path(uploaded_file.name).suffix.lower()
    if ext not in ['.xls', '.xlsx']:
        logger.warning(f"❌ DATASET IMPORT FAILED | Admin: {user} | Reason: Unsupported file type: {ext}")
        return Response(
            {'error': 'Unsupported file type. Upload an .xls or .xlsx file.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        # Debug: Show exactly what's in the uploaded file before importing
        from gender_fair_app.utils import _extract_mappings_from_excel_file
        
        logger.info(f"🔍 STEP 1: File details")
        logger.info(f"   - Name: {uploaded_file.name}")
        logger.info(f"   - Size: {getattr(uploaded_file, 'size', 'unknown')} bytes")
        logger.info(f"   - Position before seek: {uploaded_file.tell() if hasattr(uploaded_file, 'tell') else 'N/A'}")
        
        uploaded_file.seek(0)
        logger.info(f"   - Position after seek(0): {uploaded_file.tell()}")
        
        extracted_mappings = _extract_mappings_from_excel_file(uploaded_file)
        logger.info(f"🔍 STEP 2: Extraction result - Found {len(extracted_mappings)} mappings")
        for idx, (biased, fair) in enumerate(extracted_mappings):
            logger.info(f"   [{idx+1}] '{biased}' → '{fair}'")
        
        uploaded_file.seek(0)
        logger.info(f"🔍 STEP 3: Before append_mappings_to_excel_file - Position: {uploaded_file.tell()}")
        
        result = append_mappings_to_excel_file(uploaded_file, target_path=resolve_dataset_path(), merge_existing=False)
        if result is False:
            logger.error(f"❌ DATASET IMPORT FAILED | Admin: {user} | Error: import utility returned False")
            return Response(
                {'error': 'Failed to import dataset from the uploaded file.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        logger.info(
            f"✅ DATASET IMPORT SUCCESS | Admin: {user} | Added: {result.get('added_rows')} | Updated: {result.get('updated_rows')} | Imported: {result.get('imported_rows')}"
        )

        return Response(
            {
                'message': 'Dataset import completed successfully.',
                'imported_rows': result.get('imported_rows', 0),
                'added_rows': result.get('added_rows', 0),
                'updated_rows': result.get('updated_rows', 0),
                'changed': result.get('changed', False),
                'extracted_mappings': extracted_mappings[:10],  # Show first 10 in response for debugging
            },
            status=status.HTTP_200_OK,
        )
    except ValueError as exc:
        logger.warning(f"❌ DATASET IMPORT FAILED | Admin: {user} | Error: {exc}")
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.error(f"❌ DATASET IMPORT ERROR | Admin: {user} | Error: {exc}", exc_info=True)
        return Response(
            {'error': 'Unable to import dataset file. Please check the file format and try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# Health check
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check_view(request):
    """Health check endpoint"""
    logger.info(f"❤️  HEALTH CHECK REQUEST")
    logger.info(f"✅ HEALTH CHECK SUCCESS | Status: OK")
    return Response({'status': 'ok'})


# Initialize dataset on first run
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def init_dataset_view(request):
    """Initialize dataset from Excel file (admin only)"""
    user = request.user.username
    logger.info(f"🗂️  INIT DATASET REQUEST | User: {user}")
    
    if not hasattr(request.user, 'profile') or request.user.profile.role != 'admin':
        logger.warning(f"❌ INIT DATASET FAILED | User: {user} | Reason: Admin access required")
        return Response(
            {'error': 'Admin access required'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    try:
        load_dataset_to_db()
        count = BiasedWordMapping.objects.count()
        logger.info(f"✅ INIT DATASET SUCCESS | Admin: {user} | Loaded: {count} mappings")
        return Response({
            'message': f'Dataset loaded successfully with {count} mappings'
        })
    except Exception as e:
        logger.error(f"❌ INIT DATASET ERROR | Admin: {user} | Error: {str(e)}")
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['GET'])
@permission_classes([AllowAny])
def bias_mappings_view(request):
    """Return the canonical biased -> fair mappings as JSON.

    Ensures the dataset is loaded into the DB and returns all mappings.
    """
    logger.info("📚 BIAS MAPPINGS REQUEST")
    try:
        # Ensure dataset loaded into DB (idempotent)
        try:
            load_dataset_to_db()
        except Exception as e:
            logger.warning(f"⚠️ load_dataset_to_db() raised: {e}")

        mappings = BiasedWordMapping.objects.all().order_by('biased_word')
        serializer = BiasedWordMappingSerializer(mappings, many=True)
        logger.info(f"✅ BIAS MAPPINGS SUCCESS | Count: {len(serializer.data)}")
        return Response(serializer.data, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"❌ BIAS MAPPINGS ERROR: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

